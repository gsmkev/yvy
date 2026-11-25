/** Secciones de la exportación contable: qué exportar, formato, columnas y vista previa. */
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  DATE_FORMATS,
  EXPORT_COLUMNS,
  EXPORT_DATASETS,
  EXPORT_PRESETS,
  formatExportDate,
  SEPARATORS,
  type ExportConfig,
  type ExportDataset,
} from "@yvy/shared";
import { t, tk } from "../../../lib/i18n";
import { Button, ErrorBox, Field, Input, SectionHead, Select, Spinner } from "../../ui";
import type { ExportState } from "./useExportState";

const check = "h-4 w-4 shrink-0 cursor-pointer";

/** Qué se exporta: conjunto de datos y rango de fechas. */
export function WhatSection({ x }: { x: ExportState }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="exp-what">
      <div id="exp-what">
        <SectionHead title={t("ui.exp.secWhat")} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Field label={t("ui.exp.datasetLabel")}>
            <Select value={x.dataset} onChange={(e) => x.changeDataset(e.target.value as ExportDataset)} options={EXPORT_DATASETS.map((d) => ({ value: d, label: tk(`ui.exp.dataset_${d}`) }))} />
          </Field>
        </div>
        <Field label={t("ui.cost.from")}>
          <Input type="date" value={x.from} onChange={(e) => x.setFrom(e.target.value)} />
        </Field>
        <Field label={t("ui.cost.to")}>
          <Input type="date" value={x.to} onChange={(e) => x.setTo(e.target.value)} />
        </Field>
      </div>
      {x.data.isLoading && <Spinner />}
      {x.data.error && <ErrorBox error={x.data.error} />}
      {x.data.data && x.rows.length === 0 && <p className="text-sm text-tinta-2">{t("ui.exp.emptyReason")}</p>}
      {x.data.data?.truncated && <p className="text-meta text-tinta-2">{t("ui.acct.truncated")}</p>}
    </section>
  );
}

function FormatChooser({ x }: { x: ExportState }) {
  const presets = EXPORT_PRESETS.filter((p) => p.dataset === x.dataset);
  const mine = (x.saved.data ?? []).filter((s) => s.dataset === x.dataset);
  return (
    <div className="sm:col-span-2">
      <Field label={t("ui.exp.format")}>
        <Select
          value={x.picked}
          onChange={(e) => x.choose(e.target.value)}
          options={[
            { value: "", label: t("ui.exp.custom") },
            ...presets.map((p) => ({ value: p.id, label: tk(`ui.exp.preset_${p.id}`) })),
            ...mine.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      </Field>
    </div>
  );
}

function SeparatorFields({ cfg, set }: { cfg: ExportConfig; set: ExportState["set"] }) {
  return (
    <>
      <Field label={t("ui.exp.separator")}>
        <Select value={cfg.separator} onChange={(e) => set("separator", e.target.value as ExportConfig["separator"])} options={(Object.keys(SEPARATORS) as (keyof typeof SEPARATORS)[]).map((k) => ({ value: k, label: tk(`ui.exp.separator_${k}`) }))} />
      </Field>
      <Field label={t("ui.exp.dateFormat")}>
        <Select value={cfg.dateFormat} onChange={(e) => set("dateFormat", e.target.value as ExportConfig["dateFormat"])} options={DATE_FORMATS.map((f) => ({ value: f, label: `${tk(`ui.exp.date_${f}`)} (${formatExportDate("2026-11-05", f)})` }))} />
      </Field>
      <Field label={t("ui.exp.decimal")}>
        <Select value={cfg.decimal} onChange={(e) => set("decimal", e.target.value as ExportConfig["decimal"])} options={[{ value: ",", label: t("ui.exp.comma") }, { value: ".", label: t("ui.exp.dot") }]} />
      </Field>
      <Field label={t("ui.exp.thousands")}>
        <Select
          value={cfg.thousands}
          onChange={(e) => set("thousands", e.target.value as ExportConfig["thousands"])}
          options={[{ value: "", label: t("ui.exp.none") }, { value: ".", label: t("ui.exp.dot") }, { value: ",", label: t("ui.exp.comma") }, { value: " ", label: t("ui.exp.space") }]}
        />
      </Field>
    </>
  );
}

function SaveFormat({ x }: { x: ExportState }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={t("ui.exp.formatName")}>
        <Input value={x.name} maxLength={80} onChange={(e) => x.setName(e.target.value)} />
      </Field>
      <Button disabled={!x.name.trim() || x.save.isPending} title={!x.name.trim() ? t("ui.exp.nameFirst") : undefined} onClick={() => x.save.mutate()}>
        {t("ui.exp.saveFormat")}
      </Button>
      {x.saved.data?.some((s) => s.id === x.picked) && (
        <Button variant="quiet" onClick={() => x.remove.mutate(x.picked)}>
          {t("ui.exp.deleteFormat")}
        </Button>
      )}
    </div>
  );
}

/** Formato del archivo: separadores, decimales, opciones y formatos guardados. */
export function FormatSection({ x }: { x: ExportState }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="exp-format">
      <div id="exp-format">
        <SectionHead title={t("ui.exp.secFormat")} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormatChooser x={x} />
        <SeparatorFields cfg={x.cfg} set={x.set} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {(["header", "bom", "quoteAll"] as const).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className={check} checked={x.cfg[k]} onChange={(e) => x.set(k, e.target.checked)} />
            {t(`ui.exp.opt_${k}`)}
          </label>
        ))}
      </div>
      <p className="text-meta text-tinta-2">{t("ui.exp.numbersHint")}</p>
      <SaveFormat x={x} />
      {x.save.error ? <ErrorBox error={x.save.error} /> : null}
    </section>
  );
}

/** Columnas del archivo: las elegidas (con nombre editable y orden) y las que faltan. */
export function ColumnsSection({ x }: { x: ExportState }) {
  const { cfg, set } = x;
  const available = EXPORT_COLUMNS[x.dataset];
  const rest = available.filter((c) => !cfg.columns.some((k) => k.key === c.key));
  const move = (i: number, d: -1 | 1) => {
    const cols = [...cfg.columns];
    const j = i + d;
    if (j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j]!, cols[i]!];
    set("columns", cols);
  };
  return (
    <section className="flex flex-col gap-3" aria-labelledby="exp-cols">
      <div id="exp-cols">
        <SectionHead title={t("ui.exp.columns")} count={cfg.columns.length} />
      </div>
      <ul className="divide-y divide-linea border-y border-linea text-sm">
        {cfg.columns.map((c, i) => (
          <li key={c.key} className="flex items-center gap-2 py-1.5">
            <input type="checkbox" className={check} aria-label={c.key} checked onChange={() => cfg.columns.length > 1 && set("columns", cfg.columns.filter((k) => k.key !== c.key))} />
            <Input aria-label={t("ui.exp.columnLabel")} className="min-w-0 max-w-56 flex-1" value={c.label} maxLength={60} onChange={(e) => set("columns", cfg.columns.map((k) => (k.key === c.key ? { ...k, label: e.target.value } : k)))} />
            <span className="hidden min-w-0 truncate text-meta text-tinta-2 md:inline">{available.find((a) => a.key === c.key)?.label}</span>
            <span className="ml-auto flex shrink-0 gap-1">
              <Button variant="quiet" size="sm" icon={ChevronUp} disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("ui.exp.up")} title={t("ui.exp.up")} />
              <Button variant="quiet" size="sm" icon={ChevronDown} disabled={i === cfg.columns.length - 1} onClick={() => move(i, 1)} aria-label={t("ui.exp.down")} title={t("ui.exp.down")} />
            </span>
          </li>
        ))}
        {rest.map((c) => (
          <li key={c.key} className="flex items-center gap-2 py-1.5 text-tinta-2">
            <input type="checkbox" className={check} aria-label={c.key} checked={false} onChange={() => set("columns", [...cfg.columns, { key: c.key, label: c.label }])} />
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Primeras líneas del archivo tal como se va a generar. */
export function PreviewAside({ x }: { x: ExportState }) {
  const preview = x.text.split("\r\n").slice(0, x.cfg.header ? 6 : 5).join("\n");
  return (
    <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-labelledby="exp-prev">
      <div id="exp-prev">
        <SectionHead title={t("ui.exp.preview")} />
      </div>
      <pre className="num mt-3 overflow-x-auto rounded-md border border-linea bg-papel p-3 text-xs">{preview}</pre>
    </aside>
  );
}
