/** Datos de IVA de cada comprobante exportado (timbrado y montos por tasa) y el diálogo para cargarlos. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { taxMismatch, type ExportDoc } from "@yvy/shared";
import { del, put } from "../../../lib/api";
import { t } from "../../../lib/i18n";
import { fmtGs } from "../../../lib/money";
import { Button, type Column, DataTable, ErrorBox, Field, Form, FormFooter, Input, Modal, SectionHead, toast } from "../../ui";

const hasTax = (d: ExportDoc) => d.gross10 !== null || d.gross5 !== null || d.exempt !== null;
const docKey = (d: ExportDoc) => `${d.docKind}-${d.docId}`;

/** "Concepto, número" de un comprobante. */
const docDetail = (d: ExportDoc) => [d.concept, d.number].filter(Boolean).join(", ");

function taxStatus(d: ExportDoc) {
  if (!hasTax(d)) return t("ui.exp.taxNone");
  return taxMismatch(d) ? t("ui.exp.taxMismatch") : t("ui.exp.taxLoaded");
}

function taxColumns(onEdit: (d: ExportDoc) => void): Column<ExportDoc>[] {
  return [
    { id: "date", header: t("ui.cost.date"), cell: (d) => <span className="whitespace-nowrap">{d.date}</span> },
    {
      id: "party",
      header: t("ui.exp.colParty"),
      mobile: "title",
      cell: (d) => (
        <>
          {d.party || "—"}
          <span className="block text-meta font-normal text-tinta-2">{docDetail(d)}</span>
        </>
      ),
    },
    { id: "amount", header: t("ui.cost.amount"), align: "right", cell: (d) => fmtGs(d.amountPyg) },
    { id: "status", header: t("ui.exp.colTax"), hideBelow: "sm", cell: (d) => <span className="text-tinta-2">{taxStatus(d)}</span> },
    {
      id: "_actions",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      cell: (d) => (
        <Button variant="quiet" size="sm" onClick={() => onEdit(d)}>
          {t("ui.exp.taxEdit")}
        </Button>
      ),
    },
  ];
}

/** Tabla de comprobantes con su estado de IVA y la acción para cargarlo. */
export function TaxSection({ docs }: { docs: ExportDoc[] }) {
  const [taxing, setTaxing] = useState<ExportDoc | null>(null);
  const missing = docs.filter((d) => !hasTax(d)).length;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="exp-tax">
      <div id="exp-tax">
        <SectionHead title={t("ui.exp.taxTitle")} count={docs.length} />
      </div>
      <p className="text-sm text-tinta-2">{t("ui.exp.taxIntro")}</p>
      <p className="text-sm">{missing > 0 ? t("ui.exp.taxMissing", { n: missing }) : t("ui.exp.taxComplete")}</p>
      <DataTable columns={taxColumns(setTaxing)} rows={docs} rowKey={docKey} caption={t("ui.exp.taxTitle")} />
      {taxing && <TaxModal doc={taxing} onClose={() => setTaxing(null)} />}
    </section>
  );
}

type TaxForm = { timbrado: string; gross10: string; gross5: string; exempt: string };

const amountOf = (v: string) => Math.max(0, Math.round(Number(v.replace(/\./g, "").replace(",", ".")) || 0));

function useTaxMutations(doc: ExportDoc, f: TaxForm, onClose: () => void) {
  const qc = useQueryClient();
  const done = () => {
    toast(t("ui.erp.saved"));
    qc.invalidateQueries({ queryKey: ["erp", "export-rows"] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => put("/org/erp/export/taxes", { docKind: doc.docKind, docId: doc.docId, timbrado: f.timbrado || null, gross10: amountOf(f.gross10), gross5: amountOf(f.gross5), exempt: amountOf(f.exempt) }),
    onSuccess: done,
  });
  const clear = useMutation({ mutationFn: () => del(`/org/erp/export/taxes/${doc.docKind}/${doc.docId}`), onSuccess: done });
  return { save, clear };
}

function TaxModal({ doc, onClose }: { doc: ExportDoc; onClose: () => void }) {
  const [f, setF] = useState<TaxForm>({
    timbrado: doc.timbrado ?? "",
    gross10: String(doc.gross10 ?? ""),
    gross5: String(doc.gross5 ?? ""),
    exempt: String(doc.exempt ?? ""),
  });
  const { save, clear } = useTaxMutations(doc, f, onClose);
  const sum = amountOf(f.gross10) + amountOf(f.gross5) + amountOf(f.exempt);
  const field = (k: keyof TaxForm, label: string, wide = false) => (
    <Field label={label} wide={wide}>
      <Input inputMode={k === "timbrado" ? "numeric" : "decimal"} className="num" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  );
  return (
    <Modal title={t("ui.exp.taxEdit")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <p className="text-sm sm:col-span-2">{[doc.party || "—", docDetail(doc), fmtGs(doc.amountPyg)].filter(Boolean).join(", ")}</p>
        {field("timbrado", t("ui.exp.timbrado"), true)}
        {field("gross10", t("ui.exp.gross10"))}
        {field("gross5", t("ui.exp.gross5"))}
        {field("exempt", t("ui.exp.exempt"))}
        <p className={`num self-end text-sm ${Math.abs(sum - doc.amountPyg) > 5 ? "text-peligro" : ""}`}>{t("ui.exp.taxSum", { sum: fmtGs(sum), total: fmtGs(doc.amountPyg) })}</p>
        <p className="text-xs text-tinta-2 sm:col-span-2">{t("ui.exp.taxHint")}</p>
        {save.error || clear.error ? (
          <div className="sm:col-span-2">
            <ErrorBox error={save.error ?? clear.error} />
          </div>
        ) : null}
        <div className="flex gap-2 sm:col-span-2">
          <FormFooter error={null} disabled={save.isPending} label={t("ui.common.save")} />
          {hasTax(doc) && (
            <Button variant="quiet" onClick={() => clear.mutate()}>
              {t("ui.exp.taxClear")}
            </Button>
          )}
        </div>
      </Form>
    </Modal>
  );
}
