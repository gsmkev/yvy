import { useMemo, useState } from "react";
import type { Plot } from "../lib/types";
import { BRAND } from "@yvy/shared";
import { areaUnitLabel, fmtAreaValue, fmtDay, fmtNdvi } from "../lib/format";
import { t } from "../lib/i18n";
import { kindOf, sortPlots } from "../lib/plotsSort";
import { DataTable, Input, type Column } from "./ui";
import { ndviColor, vigorDrop } from "../lib/vigor";

/** Muestra del color de la rampa NDVI junto al valor; sin pasadas procesadas, un guion. */
export function Vigor({ value }: { value: number | null }) {
  if (value === null) return <span className="text-tinta-2">—</span>;
  return (
    <span className="num inline-flex items-center justify-end gap-2">
      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: ndviColor(value) }} aria-hidden />
      {fmtNdvi(value)}
    </span>
  );
}

/** Sin mayúsculas ni tildes, para que "soja" encuentre "Soja" y "Ñandú" a "nandu". */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const collator = new Intl.Collator("es-PY", { sensitivity: "base", numeric: true });
/** Sin dato cuenta como el menor: queda primero de menor a mayor y último de mayor a menor. */
const byNum = (get: (p: Plot) => number | null) => (a: Plot, b: Plot) => (get(a) ?? -1) - (get(b) ?? -1);

export function PlotsTable({ plots, onSelect }: { plots: Plot[]; onSelect: (id: string) => void }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = norm(q.trim());
    const found = needle ? plots.filter((p) => norm(`${p.name} ${p.crop ?? ""}`).includes(needle)) : plots;
    return sortPlots(found, "name", "asc");
  }, [plots, q]);
  const worse = useMemo(
    () =>
      plots
        .map((p) => ({ plot: p, drop: vigorDrop(p) }))
        .filter((w) => w.drop !== null)
        .sort((a, b) => b.drop!.pct - a.drop!.pct),
    [plots],
  );
  const dropText = (d: { pct: number; since: number }) => t("ui.vigor.drop", { pct: d.pct, date: fmtDay(d.since) });
  // Sin ninguna pasada procesada la columna Vigor sería una fila de guiones
  const hasVigor = plots.some((p) => p.ndviMean !== null);
  const columns: Column<Plot>[] = [
    {
      id: "name",
      header: t("ui.common.plot"),
      sort: (a, b) => collator.compare(a.name, b.name),
      cell: (p) => {
        const d = vigorDrop(p);
        return (
          <>
            <button className="flex cursor-pointer items-center gap-2.5 text-left font-medium" aria-label={p.name}>
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ background: p.color ?? (p.kind === "pasture" ? BRAND.trigo : BRAND.soja) }}
              />
              {p.name}
            </button>
            {d && <p className="num mt-0.5 pl-[22px] text-xs font-normal text-peligro">{dropText(d)}</p>}
          </>
        );
      },
    },
    {
      id: "kind",
      header: t("ui.common.kind"),
      sort: (a, b) => collator.compare(kindOf(a), kindOf(b)),
      cell: (p) => (
        <span className="text-tinta-2">{p.kind === "pasture" ? t("ui.common.pasture") : (p.crop ?? t("ui.common.crop"))}</span>
      ),
    },
    { id: "area", header: areaUnitLabel(), align: "right", sort: (a, b) => a.areaHa - b.areaHa, cell: (p) => fmtAreaValue(p.areaHa) },
    ...(hasVigor
      ? [
          {
            id: "vigor",
            header: t("ui.common.vigor"),
            align: "right" as const,
            sort: byNum((p) => p.ndviMean),
            cell: (p: Plot) => <Vigor value={p.ndviMean} />,
          },
        ]
      : []),
    {
      id: "visit",
      header: t("ui.last.visitShort"),
      align: "right",
      sort: byNum((p) => p.lastRecordAt),
      cell: (p) => <span className="text-tinta-2">{p.lastRecordAt ? fmtDay(p.lastRecordAt) : "—"}</span>,
    },
  ];
  return (
    <>
      {worse.length > 0 && (
        <div className="mb-5">
          <h3 className="eyebrow mb-1">{t("ui.common.worsenedPlots")}</h3>
          <ul className="divide-y divide-linea border-y border-linea text-sm">
            {worse.map(({ plot, drop }) => (
              <li key={plot.id}>
                <button
                  onClick={() => onSelect(plot.id)}
                  className="flex w-full cursor-pointer items-baseline justify-between gap-3 py-2 text-left hover:bg-surco/[0.03]"
                >
                  <span className="font-medium">{plot.name}</span>
                  <span className="num text-peligro">{dropText(drop!)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Input
        type="search"
        aria-label={t("ui.filter.plots")}
        placeholder={t("ui.filter.plots")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-2 w-full"
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        onRowClick={(p) => onSelect(p.id)}
        caption={t("ui.common.plots")}
        empty={<p className="py-4 text-sm text-tinta-2">{t("ui.no.plotMatch")}</p>}
      />
    </>
  );
}
