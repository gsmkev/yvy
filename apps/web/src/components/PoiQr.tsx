/**
 * Códigos QR de los puntos de interés (F-28): se imprimen y se pegan en el bebedero, el silo o el pluviómetro.
 * Al escanearlos con la app se abre Anotar en ese punto (sin señal también: el punto se busca en el celular).
 */
import { Printer } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { poiQrPayload } from "@yvy/shared";
import { t, tk } from "../lib/i18n";
import type { Poi } from "../lib/types";
import { Button, Modal } from "./ui";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Hoja imprimible: una tarjeta por punto con su QR, nombre y tipo. HTML autónomo, sin depender de los estilos de la app. */
export function poiQrSheetHtml(farmName: string, pois: Pick<Poi, "id" | "name" | "kind">[]): string {
  const cards = pois
    .map(
      (p) =>
        `<figure>${renderToStaticMarkup(<QRCodeSVG value={poiQrPayload(p.id)} size={180} marginSize={2} />)}<figcaption><strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(tk(`ui.poiKinds_${p.kind}`))}</figcaption></figure>`,
    )
    .join("");
  return `<!doctype html><html lang="es-PY"><head><meta charset="utf-8"><title>${escapeHtml(t("app.poiQrTitle"))} · ${escapeHtml(farmName)}</title>
<style>
body{font-family:system-ui,sans-serif;color:#1E2419;margin:16px}
h1{font-size:16px;margin:0 0 12px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
figure{margin:0;border:1px dashed #8C9186;padding:10px;text-align:center;break-inside:avoid}
figure svg{width:100%;height:auto;max-width:180px}
figcaption{font-size:14px;margin-top:6px}
@media print{@page{margin:10mm}}
</style></head><body><h1>${escapeHtml(farmName)}</h1><div class="grid">${cards}</div></body></html>`;
}

function printSheet(farmName: string, pois: Pick<Poi, "id" | "name" | "kind">[]) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(poiQrSheetHtml(farmName, pois));
  w.document.close();
  // Los QR son SVG en línea: no hay imágenes que esperar.
  w.focus();
  w.print();
}

export function PoiQrModal({ farmName, pois, onClose }: { farmName: string; pois: Poi[]; onClose: () => void }) {
  return (
    <Modal title={t("app.poiQrTitle")} onClose={onClose}>
      {pois.length === 0 ? (
        <p className="text-sm text-tinta-2">{t("app.poiQrNone")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-tinta-2">{t("app.poiQrHelp")}</p>
          <Button variant="primary" icon={Printer} onClick={() => printSheet(farmName, pois)}>
            {t("app.poiQrPrint")}
          </Button>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pois.map((p) => (
              <li key={p.id} className="flex flex-col items-center gap-1.5 rounded-md border border-linea bg-white p-3 text-center text-xs">
                <QRCodeSVG value={poiQrPayload(p.id)} size={112} marginSize={1} aria-label={`${t("app.poiQrOne")} · ${p.name}`} />
                <span className="font-medium">{p.name}</span>
                <span className="text-tinta-2">{tk(`ui.poiKinds_${p.kind}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
