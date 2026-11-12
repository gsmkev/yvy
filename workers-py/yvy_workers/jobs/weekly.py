"""Parte semanal en PDF (R-02): lo arma workers-py los lunes, lo sube a R2 y el Worker lo adjunta al email.

El PDF resume la semana anterior (lunes a domingo): anotaciones, lluvia frente a lo normal, avisos, vigor por
lote con cambio, áreas para ir a ver y un mapa de los lotes con la rampa NDVI. Los datos agregados salen de
GET /ingest/farms/:id/weekly-summary; la geometría, de /ingest/farms/:id/geometry.
Se saltean las estancias sin nadie del equipo con email (no habría a quién mandarle el parte).
"""

from __future__ import annotations

import logging
import secrets
import tempfile
from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from reportlab.graphics.shapes import Drawing, Polygon, Rect
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..ingest import IngestClient

log = logging.getLogger(__name__)

LINO = colors.HexColor("#F1EEE4")
SURCO = colors.HexColor("#1E2419")
ALERTA = colors.HexColor("#D2462B")
NDVI_RAMP = ["#B5562E", "#D9A93A", "#C9C46A", "#7A9A3F", "#3F6B35"]
KINDS = {
    "scouting": "Recorrida",
    "pest": "Plaga",
    "crop_status": "Estado del cultivo",
    "pasture_status": "Estado del pasto",
    "rain": "Lluvia",
    "water": "Agua",
    "note": "Nota",
}
SEVERITY = {"info": "informativo", "watch": "atención", "warning": "alto"}
ALERT_KINDS = {"frost": "Helada", "excess_rain": "Exceso de lluvia", "drought": "Sequía", "fire": "Fuego", "pest_threshold": "Plaga sobre el umbral"}


def week_range(today: date) -> tuple[str, str]:
    """La semana anterior completa: del lunes al domingo anteriores a `today`."""
    monday = today - timedelta(days=today.weekday())
    return (monday - timedelta(days=7)).isoformat(), (monday - timedelta(days=1)).isoformat()


def ndvi_color(v: float | None) -> colors.Color:
    """Rampa NDVI de 5 pasos entre 0,1 y 0,9."""
    if v is None:
        return colors.HexColor("#C9C4B2")
    i = min(4, max(0, int((v - 0.1) / 0.8 * 5)))
    return colors.HexColor(NDVI_RAMP[i])


def fmt_num(v: float | None, decimals: int = 0, unit: str = "") -> str:
    if v is None:
        return "—"
    s = f"{v:,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{s} {unit}".strip()


def fmt_date(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def vigor_change(ndvi: float | None, prev: float | None) -> float | None:
    """Cambio porcentual entre las dos últimas pasadas; None si falta alguna."""
    return None if ndvi is None or prev is None or prev == 0 else (ndvi - prev) / abs(prev) * 100


def plots_map(plots_geo: list[dict[str, Any]], ndvi_by_plot: dict[str, float | None], width: float = 170 * mm, height: float = 70 * mm) -> Drawing:
    """Mapa simple de los lotes coloreados por NDVI (proyección plana: alcanza a escala de estancia)."""
    rings: list[tuple[str, list[tuple[float, float]]]] = []
    for p in plots_geo:
        g = p["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
        for poly in polys:
            rings.append((p["id"], [(x, y) for x, y in poly[0]]))
    d = Drawing(width, height)
    d.add(Rect(0, 0, width, height, fillColor=LINO, strokeColor=None))
    if not rings:
        return d
    xs = [x for _, r in rings for x, _ in r]
    ys = [y for _, r in rings for _, y in r]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    k = min((width - 10) / max(x1 - x0, 1e-9), (height - 10) / max(y1 - y0, 1e-9))
    ox = (width - (x1 - x0) * k) / 2
    oy = (height - (y1 - y0) * k) / 2
    for pid, ring in rings:
        pts: list[float] = []
        for x, y in ring:
            pts += [ox + (x - x0) * k, oy + (y - y0) * k]
        d.add(Polygon(pts, fillColor=ndvi_color(ndvi_by_plot.get(pid)), strokeColor=SURCO, strokeWidth=0.4))
    return d


def build_pdf(summary: dict[str, Any], plots_geo: list[dict[str, Any]], out: Path, generated_at: datetime | None = None) -> Path:
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, alignment=0, textColor=SURCO, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, textColor=SURCO, spaceBefore=12, spaceAfter=4)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13, textColor=SURCO)
    muted = ParagraphStyle("muted", parent=body, textColor=colors.HexColor("#6B6F63"), fontSize=8.5)

    farm, per = summary["farm"], summary["period"]
    rec, rain = summary["records"], summary["rain"]
    gen = (generated_at or datetime.now(timezone.utc)).strftime("%d/%m/%Y")
    place = ", ".join(x for x in (farm.get("department"), farm.get("district")) if x)
    story: list[Any] = [
        Paragraph(f"Parte semanal · {farm['name']}", h1),
        Paragraph(f"Del {fmt_date(per['from'])} al {fmt_date(per['to'])}{' · ' + place if place else ''} · {fmt_num(farm['areaHa'], 0, 'ha')} · Generado el {gen}", muted),
        Spacer(1, 6),
    ]

    pct = None if rain["satMm"] is None or not rain["normalMm"] else rain["satMm"] / rain["normalMm"] * 100
    kpis = [
        ["Anotaciones", "Personas", "Lluvia (satélite)", "Lluvia normal", "Pluviómetro"],
        [
            str(rec["total"]),
            str(rec["authors"]),
            fmt_num(rain["satMm"], 0, "mm") + (f" ({fmt_num(pct, 0)} %)" if pct is not None else ""),
            fmt_num(rain["normalMm"], 0, "mm"),
            fmt_num(rain["gaugeMm"], 0, "mm"),
        ],
    ]
    t = Table(kpis, colWidths=[34 * mm] * 5)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), LINO), ("FONTNAME", (0, 0), (-1, 0), "Helvetica"), ("FONTSIZE", (0, 0), (-1, 0), 8), ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#6B6F63")), ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"), ("FONTSIZE", (0, 1), (-1, 1), 11), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story += [t]

    story.append(Paragraph("Anotaciones por tipo", h2))
    if rec["byKind"]:
        story.append(Paragraph(" · ".join(f"{KINDS.get(k['kind'], k['kind'])}: {k['n']}" for k in rec["byKind"]), body))
    else:
        story.append(Paragraph("Esta semana no se anotó nada.", body))

    story.append(Paragraph("Avisos", h2))
    if summary["alerts"]:
        for a in summary["alerts"]:
            story.append(Paragraph(f"• {ALERT_KINDS.get(a['kind'], a['kind'])} ({SEVERITY.get(a['severity'], a['severity'])}): {a['summary']}", body))
    else:
        story.append(Paragraph("Sin avisos esta semana.", body))

    ndvi_by_plot = {p["id"]: p["ndvi"] for p in summary["plots"]}
    story.append(Paragraph("Vigor por lote", h2))
    story.append(plots_map(plots_geo, ndvi_by_plot))
    rows = [["Lote", "Cultivo", "ha", "NDVI", "Cambio"]]
    for p in summary["plots"]:
        ch = vigor_change(p["ndvi"], p["ndviPrev"])
        rows.append([p["name"], p["crop"] or ("Pasto" if p["kind"] == "pasture" else "—"), fmt_num(p["areaHa"], 0), fmt_num(p["ndvi"], 2), "—" if ch is None else f"{ch:+.0f} %".replace(".", ",")])
    if len(rows) > 1:
        pt = Table(rows, colWidths=[60 * mm, 40 * mm, 20 * mm, 20 * mm, 25 * mm], repeatRows=1)
        style = [("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("LINEBELOW", (0, 0), (-1, 0), 0.8, SURCO), ("LINEBELOW", (0, 1), (-1, -1), 0.3, colors.HexColor("#DDD8C8")), ("ALIGN", (2, 0), (-1, -1), "RIGHT")]
        for i, p in enumerate(summary["plots"], start=1):
            ch = vigor_change(p["ndvi"], p["ndviPrev"])
            if ch is not None and ch <= -15:  # RF-54: caída de más de 15 %
                style.append(("TEXTCOLOR", (4, i), (4, i), ALERTA))
        pt.setStyle(TableStyle(style))
        story += [Spacer(1, 6), pt]
    else:
        story.append(Paragraph("Todavía no hay lotes cargados.", body))

    story.append(Paragraph("Áreas para ir a ver", h2))
    if summary["problemAreas"]:
        story.append(Paragraph(" · ".join(f"{a['plotName']}: {fmt_num(a['areaHa'], 1, 'ha')}" for a in summary["problemAreas"][:12]), body))
        story.append(Paragraph("Partes del lote con el vigor muy por debajo del resto. Están marcadas en el mapa de la web; desde ahí se mandan a recorrer.", muted))
    else:
        story.append(Paragraph("No se detectaron áreas con vigor bajo.", body))

    story += [Spacer(1, 14), Paragraph("Datos: Sentinel-2 (Copernicus), CHIRPS y NASA POWER. Orientativo: un satélite puede no ver por las nubes. Contiene datos modificados de Copernicus Sentinel.", muted)]
    doc = SimpleDocTemplate(str(out), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm, title=f"Parte semanal · {farm['name']}", author="Yvy")
    doc.build(story)
    return out


Upload = Callable[[Path, str], None]


def weekly_report(api: IngestClient, farms: list[dict[str, Any]], today: date | None = None, upload: Upload | None = None) -> int:
    """Arma, sube y registra el PDF de cada estancia con destinatario. Devuelve la cantidad de fallas."""
    if upload is None:
        from ..storage import upload_report as upload
    start, end = week_range(today or datetime.now(timezone.utc).date())
    failures = 0
    for f in farms:
        if not f.get("hasReportRecipient"):
            log.info("%s: sin email de dueño o administrador, se saltea", f["name"])
            continue
        try:
            summary = api.weekly_summary(f["id"], start, end)
            plots_geo = api.farm_geometry(f["id"])["plots"]
            key = f"reports/{f['id']}/{secrets.token_hex(8)}/parte-{end}.pdf"
            with tempfile.TemporaryDirectory() as tmp:
                pdf = build_pdf(summary, plots_geo, Path(tmp) / "parte.pdf")
                upload(pdf, key)
            api.weekly_report(f["id"], start, end, key)
            log.info("%s: parte %s a %s subido", f["name"], start, end)
        except Exception:
            failures += 1
            log.exception("falló el parte semanal de %s", f["name"])
    return failures
