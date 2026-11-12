/** Exportación para sistemas contables locales (I-06): compras, ventas y caja con formato configurable y libro IVA de Paraguay. */
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
import { del, get, post, put, qs } from "../../lib/api";
import { download } from "../../lib/exports";
import { fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { Button, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../ui";
import { ExportableTable } from "../ExportableTable";

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
    queryFn: () => get<Rows>(`/org/erp/export/rows${qs({ dataset, from, to })}`),
  });
  const save = useMutation({
    mutationFn: () => {
      const existing = saved.data?.find((x) => x.id === picked);
      return existing && existing.name === name.trim() ? put(`/org/erp/export/formats/${existing.id}`, { name: name.trim(), dataset, config: cfg }) : post<{ id: string }>("/org/erp/export/formats", { name: name.trim(), dataset, config: cfg });
    },
    onSuccess: (r) => {
      toast(t("ui.erpSaved"));
      if (r && typeof r === "object" && "id" in r) setPicked((r as { id: string }).id);
      qc.invalidateQueries({ queryKey: ["erp", "export-formats"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/export/formats/${id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
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
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-tinta-2">{t("ui.expIntro")}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label={t("ui.expDataset")}>
          <Select value={dataset} onChange={(e) => changeDataset(e.target.value as ExportDataset)} options={EXPORT_DATASETS.map((d) => ({ value: d, label: tk(`ui.expDataset_${d}`) }))} />
        </Field>
        <Field label={t("ui.costFrom")}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t("ui.costTo")}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label={t("ui.expFormat")}>
          <Select
            value={picked}
            onChange={(e) => choose(e.target.value)}
            options={[
              { value: "", label: t("ui.expCustom") },
              ...presets.map((p) => ({ value: p.id, label: tk(`ui.expPreset_${p.id}`) })),
              ...mine.map((x) => ({ value: x.id, label: x.name })),
            ]}
          />
        </Field>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="exp-opts">
        <h2 id="exp-opts" className="border-b border-linea pb-2 font-serif text-lg font-semibold">
          {t("ui.expOptions")}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label={t("ui.expSeparator")}>
            <Select value={cfg.separator} onChange={(e) => set("separator", e.target.value as ExportConfig["separator"])} options={(Object.keys(SEPARATORS) as (keyof typeof SEPARATORS)[]).map((k) => ({ value: k, label: tk(`ui.expSeparator_${k}`) }))} />
          </Field>
          <Field label={t("ui.expDateFormat")}>
            <Select value={cfg.dateFormat} onChange={(e) => set("dateFormat", e.target.value as ExportConfig["dateFormat"])} options={DATE_FORMATS.map((f) => ({ value: f, label: `${tk(`ui.expDate_${f}`)} (${formatExportDate("2026-11-05", f)})` }))} />
          </Field>
          <Field label={t("ui.expDecimal")}>
            <Select value={cfg.decimal} onChange={(e) => set("decimal", e.target.value as ExportConfig["decimal"])} options={[{ value: ",", label: t("ui.expComma") }, { value: ".", label: t("ui.expDot") }]} />
          </Field>
          <Field label={t("ui.expThousands")}>
            <Select
              value={cfg.thousands}
              onChange={(e) => set("thousands", e.target.value as ExportConfig["thousands"])}
              options={[{ value: "", label: t("ui.expNone") }, { value: ".", label: t("ui.expDot") }, { value: ",", label: t("ui.expComma") }, { value: " ", label: t("ui.expSpace") }]}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {(["header", "bom", "quoteAll"] as const).map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={cfg[k]} onChange={(e) => set(k, e.target.checked)} />
              {t(`ui.expOpt_${k}`)}
            </label>
          ))}
        </div>
        <p className="text-xs text-tinta-2">{t("ui.expNumbersHint")}</p>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="exp-cols">
        <h2 id="exp-cols" className="border-b border-linea pb-2 font-serif text-lg font-semibold">
          {t("ui.expColumns")}
        </h2>
        <ul className="divide-y divide-linea border-b border-linea text-sm">
          {cfg.columns.map((c, i) => (
            <li key={c.key} className="flex items-center gap-2 py-1.5">
              <input type="checkbox" aria-label={c.key} checked onChange={() => cfg.columns.length > 1 && set("columns", cfg.columns.filter((x) => x.key !== c.key))} />
              <Input aria-label={t("ui.expColumnLabel")} className="max-w-56" value={c.label} maxLength={60} onChange={(e) => set("columns", cfg.columns.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)))} />
              <span className="text-tinta-2">{available.find((a) => a.key === c.key)?.label}</span>
              <span className="ml-auto flex gap-1">
                <Button variant="quiet" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("ui.expUp")}>
                  {t("ui.expUp")}
                </Button>
                <Button variant="quiet" disabled={i === cfg.columns.length - 1} onClick={() => move(i, 1)} aria-label={t("ui.expDown")}>
                  {t("ui.expDown")}
                </Button>
              </span>
            </li>
          ))}
          {rest.map((c) => (
            <li key={c.key} className="flex items-center gap-2 py-1.5 text-tinta-2">
              <input type="checkbox" aria-label={c.key} checked={false} onChange={() => set("columns", [...cfg.columns, { key: c.key, label: c.label }])} />
              <span>{c.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {dataset !== "cash" && (
        <section className="flex flex-col gap-2" aria-labelledby="exp-tax">
          <h2 id="exp-tax" className="border-b border-linea pb-2 font-serif text-lg font-semibold">
            {t("ui.expTaxTitle")}
          </h2>
          <p className="text-sm text-tinta-2">{t("ui.expTaxIntro")}</p>
          {docs.length > 0 && (
            <>
              <p className="text-sm">{missingTax > 0 ? t("ui.expTaxMissing", { n: missingTax }) : t("ui.expTaxComplete")}</p>
              <div className="overflow-x-auto">
                <ExportableTable name="comprobantes">
                  <table className="w-full text-sm">
                    <tbody>
                      {docs.map((d) => (
                        <tr key={`${d.docKind}-${d.docId}`} className="border-t border-linea">
                          <td className="num py-2 pr-3">{d.date}</td>
                          <td className="py-2 pr-3">
                            <span className="font-medium">{d.party || "—"}</span>
                            <span className="block text-xs text-tinta-2">
                              {d.concept}
                              {d.number ? ` · ${d.number}` : ""}
                            </span>
                          </td>
                          <td className="num py-2 pr-3 text-right">{fmtGs(d.amountPyg)}</td>
                          <td className="py-2 pr-3 text-xs text-tinta-2">
                            {d.gross10 === null && d.gross5 === null && d.exempt === null ? t("ui.expTaxNone") : taxMismatch(d) ? t("ui.expTaxMismatch") : t("ui.expTaxLoaded")}
                          </td>
                          <td className="py-2 text-right">
                            <button className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-surco hover:underline" onClick={() => setTaxing(d)}>
                              {t("ui.expTaxEdit")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ExportableTable>
              </div>
            </>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="exp-prev">
        <h2 id="exp-prev" className="border-b border-linea pb-2 font-serif text-lg font-semibold">
          {t("ui.expPreview")}
        </h2>
        {data.isLoading && <Spinner />}
        {data.error && <ErrorBox error={data.error} />}
        {data.data && rows.length === 0 && <p className="text-sm text-tinta-2">{t("ui.expEmpty")}</p>}
        {rows.length > 0 && <pre className="num overflow-x-auto rounded-md border border-linea bg-white p-3 text-xs">{preview}</pre>}
        {data.data?.truncated && <p className="text-xs text-tinta-2">{t("ui.acctTruncated")}</p>}
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="primary" disabled={rows.length === 0} onClick={downloadFile}>
            {t("ui.expDownload", { n: fmtNum(rows.length) })}
          </Button>
          <Field label={t("ui.expFormatName")}>
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {t("ui.expSaveFormat")}
          </Button>
          {saved.data?.some((x) => x.id === picked) && (
            <Button variant="quiet" onClick={() => remove.mutate(picked)}>
              {t("ui.expDeleteFormat")}
            </Button>
          )}
        </div>
        {save.error ? <ErrorBox error={save.error} /> : null}
      </section>
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
    toast(t("ui.erpSaved"));
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
    <Modal title={t("ui.expTaxEdit")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          saveTax.mutate();
        }}
      >
        <p className="col-span-2 text-sm">
          {doc.party || "—"} · {doc.concept}
          {doc.number ? ` · ${doc.number}` : ""} · {fmtGs(doc.amountPyg)}
        </p>
        <div className="col-span-2">{field("timbrado", t("ui.expTimbrado"))}</div>
        {field("gross10", t("ui.expGross10"))}
        {field("gross5", t("ui.expGross5"))}
        {field("exempt", t("ui.expExempt"))}
        <p className={`num self-end text-sm ${Math.abs(sum - doc.amountPyg) > 5 ? "text-peligro" : ""}`}>{t("ui.expTaxSum", { sum: fmtGs(sum), total: fmtGs(doc.amountPyg) })}</p>
        <p className="col-span-2 text-xs text-tinta-2">{t("ui.expTaxHint")}</p>
        {saveTax.error || clear.error ? (
          <div className="col-span-2">
            <ErrorBox error={saveTax.error ?? clear.error} />
          </div>
        ) : null}
        <div className="col-span-2 flex gap-2">
          <Button type="submit" variant="primary" disabled={saveTax.isPending}>
            {t("ui.save")}
          </Button>
          {(doc.gross10 !== null || doc.gross5 !== null || doc.exempt !== null) && (
            <Button variant="quiet" onClick={() => clear.mutate()}>
              {t("ui.expTaxClear")}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
