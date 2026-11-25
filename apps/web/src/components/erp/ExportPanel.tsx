/** Exportación para sistemas contables locales: compras, ventas y caja con formato configurable y libro IVA de Paraguay. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DATE_FORMATS,
  defaultExportConfig,
  EXPORT_COLUMNS,
  EXPORT_DATASETS,
  EXPORT_PRESETS,
  formatExportDate,
  renderExport,
  SEPARATORS,
  taxMismatch,
  type ExportCashMove,
  type ExportConfig,
  type ExportDataset,
  type ExportDoc,
  localDate,
} from "@yvy/shared";
import { del, get, post, put, withQs } from "../../lib/api";
import { download } from "../../lib/exports";
import { fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button, type Column, DataTable, ErrorBox, Field, Form, Input, Modal, SectionHead, Select, Spinner, toast } from "../ui";
import { HeaderActions } from "./adminSlot";

interface Saved {
  id: string;
  name: string;
  dataset: ExportDataset;
  config: ExportConfig;
}
interface Rows {
  truncated: boolean;
  rows: (ExportDoc | ExportCashMove)[];
}

const monthStart = () => localDate(Date.now()).slice(0, 8) + "01";

/** Exportación para sistemas contables locales con formato configurable. */
export function ExportPanel() {
  const qc = useQueryClient();
  const [dataset, setDataset] = useState<ExportDataset>("purchases");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(localDate(Date.now()));
  const [cfg, setCfg] = useState<ExportConfig>(EXPORT_PRESETS[0].config());
  const [picked, setPicked] = useState<string>(EXPORT_PRESETS[0].id);
  const [name, setName] = useState("");
  const [taxing, setTaxing] = useState<ExportDoc | null>(null);
  const saved = useQuery({ queryKey: ["erp", "export-formats"], queryFn: () => get<Saved[]>("/org/erp/export/formats") });
  const data = useQuery({
    queryKey: ["erp", "export-rows", dataset, from, to],
    enabled: !!from && !!to && from <= to,
    queryFn: () => get<Rows>(withQs("/org/erp/export/rows", { dataset, from, to })),
  });
  const save = useMutation({
    mutationFn: () => {
      const existing = saved.data?.find((x) => x.id === picked);
      return existing && existing.name === name.trim() ? put(`/org/erp/export/formats/${existing.id}`, { name: name.trim(), dataset, config: cfg }) : post<{ id: string }>("/org/erp/export/formats", { name: name.trim(), dataset, config: cfg });
    },
    onSuccess: (r) => {
      toast(t("ui.erp.saved"));
      if (r && typeof r === "object" && "id" in r) setPicked((r as { id: string }).id);
      qc.invalidateQueries({ queryKey: ["erp", "export-formats"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/export/formats/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      setPicked("");
      qc.invalidateQueries({ queryKey: ["erp", "export-formats"] });
    },
  });
  const presets = EXPORT_PRESETS.filter((p) => p.dataset === dataset);
  const mine = (saved.data ?? []).filter((x) => x.dataset === dataset);
  const choose = (id: string, ds: ExportDataset = dataset) => {
    setPicked(id);
    const preset = EXPORT_PRESETS.find((p) => p.id === id);
    const own = saved.data?.find((x) => x.id === id);
    if (preset) setCfg(preset.config());
    else if (own) {
      setCfg(own.config);
      setName(own.name);
    } else setCfg(defaultExportConfig(ds));
  };
  const changeDataset = (ds: ExportDataset) => {
    setDataset(ds);
    const preset = EXPORT_PRESETS.find((p) => p.dataset === ds);
    choose(preset ? preset.id : "", ds);
  };
  const set = <K extends keyof ExportConfig>(k: K, v: ExportConfig[K]) => setCfg({ ...cfg, [k]: v });
  // Columnas: primero las elegidas (en su orden) y después las que faltan.
  const available = EXPORT_COLUMNS[dataset];
  const rest = available.filter((c) => !cfg.columns.some((x) => x.key === c.key));
  const move = (i: number, d: -1 | 1) => {
    const cols = [...cfg.columns];
    const j = i + d;
    if (j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j]!, cols[i]!];
    set("columns", cols);
  };
  const rows = data.data?.rows ?? [];
  const text = renderExport(dataset, rows, cfg);
  const preview = text.split("\r\n").slice(0, cfg.header ? 6 : 5).join("\n");
  const docs = dataset === "cash" ? [] : (rows as ExportDoc[]);
  const missingTax = docs.filter((d) => d.gross10 === null && d.gross5 === null && d.exempt === null).length;
  const downloadFile = () => {
    const blob = new Blob([cfg.bom ? "﻿" : "", text], { type: "text/csv;charset=utf-8" });
    download(blob, `${dataset}-${from}_${to}.${cfg.separator === "tab" ? "txt" : "csv"}`);
  };
  const check = "h-4 w-4 shrink-0 cursor-pointer";
  const taxCols: Column<ExportDoc>[] = [
    { id: "date", header: t("ui.cost.date"), cell: (d) => <span className="whitespace-nowrap">{d.date}</span> },
    {
      id: "party",
      header: t("ui.exp.colParty"),
      cell: (d) => (
        <>
          {d.party || "—"}
          <span className="block text-meta font-normal text-tinta-2">
            {d.concept}
            {d.number ? ` · ${d.number}` : ""}
          </span>
        </>
      ),
    },
    { id: "amount", header: t("ui.cost.amount"), align: "right", cell: (d) => fmtGs(d.amountPyg) },
    {
      id: "status",
      header: t("ui.exp.colTax"),
      hideBelow: "sm",
      cell: (d) => <span className="text-tinta-2">{d.gross10 === null && d.gross5 === null && d.exempt === null ? t("ui.exp.taxNone") : taxMismatch(d) ? t("ui.exp.taxMismatch") : t("ui.exp.taxLoaded")}</span>,
    },
    {
      id: "_actions",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      cell: (d) => (
        <Button variant="quiet" size="sm" onClick={() => setTaxing(d)}>
          {t("ui.exp.taxEdit")}
        </Button>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-8">
      <HeaderActions>
        <Button variant="primary" disabled={rows.length === 0} title={rows.length === 0 ? t("ui.exp.empty") : undefined} onClick={downloadFile}>
          {t("ui.exp.download", { n: fmtNum(rows.length) })}
        </Button>
      </HeaderActions>
      <div className={`grid gap-x-10 gap-y-8 ${rows.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]" : ""}`}>
        <div className={`flex min-w-0 flex-col gap-8 ${rows.length > 0 ? "" : "max-w-3xl"}`}>
          <section className="flex flex-col gap-3" aria-labelledby="exp-what">
            <div id="exp-what">
              <SectionHead title={t("ui.exp.secWhat")} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Field label={t("ui.exp.datasetLabel")}>
                  <Select value={dataset} onChange={(e) => changeDataset(e.target.value as ExportDataset)} options={EXPORT_DATASETS.map((d) => ({ value: d, label: tk(`ui.exp.dataset_${d}`) }))} />
                </Field>
              </div>
              <Field label={t("ui.cost.from")}>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label={t("ui.cost.to")}>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            {data.isLoading && <Spinner />}
            {data.error && <ErrorBox error={data.error} />}
            {data.data && rows.length === 0 && <p className="text-sm text-tinta-2">{t("ui.exp.emptyReason")}</p>}
            {data.data?.truncated && <p className="text-meta text-tinta-2">{t("ui.acct.truncated")}</p>}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="exp-format">
            <div id="exp-format">
              <SectionHead title={t("ui.exp.secFormat")} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={t("ui.exp.format")}>
                  <Select
                    value={picked}
                    onChange={(e) => choose(e.target.value)}
                    options={[
                      { value: "", label: t("ui.exp.custom") },
                      ...presets.map((p) => ({ value: p.id, label: tk(`ui.exp.preset_${p.id}`) })),
                      ...mine.map((x) => ({ value: x.id, label: x.name })),
                    ]}
                  />
                </Field>
              </div>
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
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {(["header", "bom", "quoteAll"] as const).map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" className={check} checked={cfg[k]} onChange={(e) => set(k, e.target.checked)} />
                  {t(`ui.exp.opt_${k}`)}
                </label>
              ))}
            </div>
            <p className="text-meta text-tinta-2">{t("ui.exp.numbersHint")}</p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t("ui.exp.formatName")}>
                <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button disabled={!name.trim() || save.isPending} title={!name.trim() ? t("ui.exp.nameFirst") : undefined} onClick={() => save.mutate()}>
                {t("ui.exp.saveFormat")}
              </Button>
              {saved.data?.some((x) => x.id === picked) && (
                <Button variant="quiet" onClick={() => remove.mutate(picked)}>
                  {t("ui.exp.deleteFormat")}
                </Button>
              )}
            </div>
            {save.error ? <ErrorBox error={save.error} /> : null}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="exp-cols">
            <div id="exp-cols">
              <SectionHead title={t("ui.exp.columns")} count={cfg.columns.length} />
            </div>
            <ul className="divide-y divide-linea border-y border-linea text-sm">
              {cfg.columns.map((c, i) => (
                <li key={c.key} className="flex items-center gap-2 py-1.5">
                  <input type="checkbox" className={check} aria-label={c.key} checked onChange={() => cfg.columns.length > 1 && set("columns", cfg.columns.filter((x) => x.key !== c.key))} />
                  <Input aria-label={t("ui.exp.columnLabel")} className="min-w-0 max-w-56 flex-1" value={c.label} maxLength={60} onChange={(e) => set("columns", cfg.columns.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)))} />
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
        </div>

        {rows.length > 0 && (
          <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-labelledby="exp-prev">
            <div id="exp-prev">
              <SectionHead title={t("ui.exp.preview")} />
            </div>
            <pre className="num mt-3 overflow-x-auto rounded-md border border-linea bg-papel p-3 text-xs">{preview}</pre>
          </aside>
        )}
      </div>

      {dataset !== "cash" && docs.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="exp-tax">
          <div id="exp-tax">
            <SectionHead title={t("ui.exp.taxTitle")} count={docs.length} />
          </div>
          <p className="text-sm text-tinta-2">{t("ui.exp.taxIntro")}</p>
          <p className="text-sm">{missingTax > 0 ? t("ui.exp.taxMissing", { n: missingTax }) : t("ui.exp.taxComplete")}</p>
          <DataTable columns={taxCols} rows={docs} rowKey={(d) => `${d.docKind}-${d.docId}`} caption={t("ui.exp.taxTitle")} />
        </section>
      )}
      {taxing && <TaxModal doc={taxing} onClose={() => setTaxing(null)} />}
    </div>
  );
}

function TaxModal({ doc, onClose }: { doc: ExportDoc; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    timbrado: doc.timbrado ?? "",
    gross10: String(doc.gross10 ?? ""),
    gross5: String(doc.gross5 ?? ""),
    exempt: String(doc.exempt ?? ""),
  });
  const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/\./g, "").replace(",", ".")) || 0));
  const sum = n(f.gross10) + n(f.gross5) + n(f.exempt);
  const done = () => {
    toast(t("ui.erp.saved"));
    qc.invalidateQueries({ queryKey: ["erp", "export-rows"] });
    onClose();
  };
  const saveTax = useMutation({
    mutationFn: () => put("/org/erp/export/taxes", { docKind: doc.docKind, docId: doc.docId, timbrado: f.timbrado || null, gross10: n(f.gross10), gross5: n(f.gross5), exempt: n(f.exempt) }),
    onSuccess: done,
  });
  const clear = useMutation({ mutationFn: () => del(`/org/erp/export/taxes/${doc.docKind}/${doc.docId}`), onSuccess: done });
  const field = (k: keyof typeof f, label: string) => (
    <Field label={label}>
      <Input inputMode={k === "timbrado" ? "numeric" : "decimal"} className="num" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  );
  return (
    <Modal title={t("ui.exp.taxEdit")} onClose={onClose}>
      <Form onSubmit={() => saveTax.mutate()}>
        <p className="sm:col-span-2 text-sm">
          {doc.party || "—"} · {doc.concept}
          {doc.number ? ` · ${doc.number}` : ""} · {fmtGs(doc.amountPyg)}
        </p>
        <div className="sm:col-span-2">{field("timbrado", t("ui.exp.timbrado"))}</div>
        {field("gross10", t("ui.exp.gross10"))}
        {field("gross5", t("ui.exp.gross5"))}
        {field("exempt", t("ui.exp.exempt"))}
        <p className={`num self-end text-sm ${Math.abs(sum - doc.amountPyg) > 5 ? "text-peligro" : ""}`}>{t("ui.exp.taxSum", { sum: fmtGs(sum), total: fmtGs(doc.amountPyg) })}</p>
        <p className="sm:col-span-2 text-xs text-tinta-2">{t("ui.exp.taxHint")}</p>
        {saveTax.error || clear.error ? (
          <div className="sm:col-span-2">
            <ErrorBox error={saveTax.error ?? clear.error} />
          </div>
        ) : null}
        <div className="sm:col-span-2 flex gap-2">
          <Button type="submit" variant="primary" disabled={saveTax.isPending}>
            {t("ui.common.save")}
          </Button>
          {(doc.gross10 !== null || doc.gross5 !== null || doc.exempt !== null) && (
            <Button variant="quiet" onClick={() => clear.mutate()}>
              {t("ui.exp.taxClear")}
            </Button>
          )}
        </div>
      </Form>
    </Modal>
  );
}
