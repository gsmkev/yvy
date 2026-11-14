/** Feedlot (G-33): raciones, suministro por corral y conversión alimenticia. Solo dueño y administrador. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { newId, noonAsuncion, rationLines, rationPctTotal, RECORD_SCHEMA_VERSION, localDate, LIMITS, type PushResponse, type RationItem } from "@yvy/shared";
import { del, get, post, put, qs } from "../../lib/api";
import { fmtDate, fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { useFarm, useFarms } from "../../lib/queries";
import { useProducts } from "../ProductsPanel";
import { Button, ConfirmModal, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../ui";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions, RowMenu } from "./adminSlot";

interface Ration {
  id: string;
  name: string;
  note: string | null;
  items: RationItem[];
}
interface Corral {
  plotId: string;
  plotName: string;
  feedKgDm: number;
  feedKgAsFed: number;
  feeds: number;
  status: "ok" | "no_weighings" | "no_head" | "no_gain";
  firstAt: number | null;
  lastAt: number | null;
  head: number | null;
  gainKg: number | null;
  dailyGainKg: number | null;
  windowKgDm: number | null;
  conversion: number | null;
}

const useRations = () => useQuery({ queryKey: ["erp", "feedlot", "rations"], queryFn: () => get<Ration[]>("/org/erp/feedlot/rations") });

export function FeedlotPanel() {
  const rations = useRations();
  const products = useProducts();
  const farms = useFarms();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Ration | "new" | null>(null);
  const [removing, setRemoving] = useState<Ration | null>(null);
  const [feeding, setFeeding] = useState(false);
  const remove = useMutation({
    mutationFn: (r: Ration) => del(`/org/erp/feedlot/rations/${r.id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["erp", "feedlot"] });
    },
  });
  if (rations.isLoading || products.isLoading) return <Spinner />;
  if (rations.error) return <ErrorBox error={rations.error} />;
  const name = (id: string) => products.data?.find((p) => p.id === id)?.name ?? "—";
  const list = rations.data ?? [];
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="rations-h">
        <h2 id="rations-h" className="border-b border-linea pb-2 text-[18px] leading-6 font-semibold">
          {t("ui.feedlotRations")}
        </h2>
        <HeaderActions>
          <Button variant="primary" onClick={() => setFeeding(true)} disabled={list.length === 0 || !farms.data?.length}>
            {t("ui.feedlotFeed")}
          </Button>
          <Button onClick={() => setEditing("new")}>{t("ui.feedlotRationNew")}</Button>
        </HeaderActions>
        {list.length === 0 ? (
          <Empty>{t("ui.feedlotNoRations")}</Empty>
        ) : (
          <ul className="divide-y divide-linea border-y border-linea text-sm">
            {list.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{r.name}</p>
                  <p className="num text-tinta-2">{r.items.map((i) => `${name(i.productId)} ${fmtNum(i.pctDm)} %`).join(" · ")}</p>
                </div>
                <RowMenu name={r.name} onEdit={() => setEditing(r)} onDelete={() => setRemoving(r)} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <CorralReport />
      {editing && <RationModal ration={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {feeding && <FeedModal rations={list} onClose={() => setFeeding(false)} />}
      {removing && (
        <ConfirmModal
          title={t("ui.feedlotRationDelete")}
          message={removing.name}
          confirmLabel={t("ui.delete")}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function RationModal({ ration, onClose }: { ration: Ration | null; onClose: () => void }) {
  const products = useProducts();
  const qc = useQueryClient();
  const kgProducts = (products.data ?? []).filter((p) => p.unit === "kg");
  const [name, setName] = useState(ration?.name ?? "");
  const [rows, setRows] = useState<{ productId: string; pctDm: string; dmPct: string }[]>(
    ration?.items.map((i) => ({ productId: i.productId, pctDm: String(i.pctDm), dmPct: String(i.dmPct) })) ?? [{ productId: "", pctDm: "", dmPct: "100" }],
  );
  const n = (v: string) => Number(v.replace(",", "."));
  const items = rows.filter((r) => r.productId).map((r) => ({ productId: r.productId, pctDm: n(r.pctDm), dmPct: n(r.dmPct) || 100 }));
  const total = rationPctTotal(items.map((i) => ({ pctDm: Number.isFinite(i.pctDm) ? i.pctDm : 0 })));
  const save = useMutation({
    mutationFn: () => (ration ? put(`/org/erp/feedlot/rations/${ration.id}`, { name, items }) : post("/org/erp/feedlot/rations", { name, items })),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp", "feedlot"] });
      onClose();
    },
  });
  const set = (i: number, k: "productId" | "pctDm" | "dmPct", v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <Modal title={ration ? t("ui.feedlotRationEdit") : t("ui.feedlotRationNew")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.feedlotRationName")}>
          <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {kgProducts.length === 0 && <p className="text-sm text-peligro">{t("ui.feedlotNoKgProducts")}</p>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_5.5rem_5.5rem] items-end gap-2">
            <Field label={i === 0 ? t("ui.feedlotIngredient") : ""}>
              <Select
                value={r.productId}
                onChange={(e) => set(i, "productId", e.target.value)}
                options={[{ value: "", label: "—" }, ...kgProducts.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </Field>
            <Field label={i === 0 ? t("ui.feedlotPctDm") : ""}>
              <Input inputMode="decimal" className="num" value={r.pctDm} onChange={(e) => set(i, "pctDm", e.target.value)} />
            </Field>
            <Field label={i === 0 ? t("ui.feedlotProductDm") : ""}>
              <Input inputMode="decimal" className="num" value={r.dmPct} onChange={(e) => set(i, "dmPct", e.target.value)} />
            </Field>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button variant="quiet" disabled={rows.length >= LIMITS.feedlot.maxRationItems} onClick={() => setRows([...rows, { productId: "", pctDm: "", dmPct: "100" }])}>
            {t("ui.feedlotAddIngredient")}
          </Button>
          <p className={`num text-sm ${Math.abs(total - 100) <= LIMITS.feedlot.pctTolerance ? "" : "text-peligro"}`}>{t("ui.feedlotPctTotal", { n: fmtNum(total) })}</p>
        </div>
        <p className="text-xs text-tinta-2">{t("ui.feedlotPctHint")}</p>
        {save.error && <ErrorBox error={save.error} />}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={save.isPending || items.length === 0}>
            {t("ui.save")}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FeedModal({ rations, onClose }: { rations: Ration[]; onClose: () => void }) {
  const farms = useFarms();
  const products = useProducts();
  const qc = useQueryClient();
  const [f, setF] = useState({ farmId: "", plotId: "", rationId: rations[0]?.id ?? "", kgDm: "", head: "", date: localDate(Date.now()) });
  const farmId = f.farmId || farms.data?.[0]?.id || "";
  const farm = useFarm(farmId, !!farmId);
  const corrals = (farm.data?.plots ?? []).filter((p) => p.kind === "pasture");
  const plotId = f.plotId || corrals[0]?.id || "";
  const ration = rations.find((r) => r.id === f.rationId);
  const kgDm = Number(f.kgDm.replace(",", "."));
  const lines = ration && kgDm > 0 ? rationLines(ration.items, kgDm) : [];
  const nameOf = (id: string) => products.data?.find((p) => p.id === id)?.name ?? "—";
  const save = useMutation({
    mutationFn: async () => {
      if (!ration) return;
      const at = Math.min(noonAsuncion(f.date), Date.now() - 1000);
      const res = await post<PushResponse>("/sync/push", {
        deviceId: "web",
        mutations: [
          {
            mutationId: newId(),
            kind: "records.upsert",
            row: {
              id: newId(),
              farmId,
              plotId,
              poiId: null,
              kind: "feed",
              data: {
                rationId: ration.id,
                ration: ration.name,
                kgDm,
                ...(f.head ? { head: Number(f.head) } : {}),
                items: lines.map((l) => ({ productId: l.productId, name: nameOf(l.productId), kg: l.kg })),
              },
              schemaVersion: RECORD_SCHEMA_VERSION,
              lon: null,
              lat: null,
              gpsAccuracyM: null,
              capturedAt: at,
            },
          },
        ],
      });
      const r = res.results[0];
      if (r?.status === "rejected") throw new Error(r.detail ?? t("ui.fuelRejected"));
    },
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={t("ui.feedlotFeed")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.costFarm")}>
          <Select value={farmId} onChange={(e) => setF({ ...f, farmId: e.target.value, plotId: "" })} options={(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
        </Field>
        <Field label={t("ui.feedlotCorral")}>
          <Select value={plotId} onChange={(e) => setF({ ...f, plotId: e.target.value })} options={corrals.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <Field label={t("ui.feedlotRation")}>
          <Select value={f.rationId} onChange={(e) => setF({ ...f, rationId: e.target.value })} options={rations.map((r) => ({ value: r.id, label: r.name }))} />
        </Field>
        <Field label={t("ui.costDate")}>
          <Input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label={t("ui.feedlotKgDm")}>
          <Input type="number" required min={0} step="any" value={f.kgDm} onChange={(e) => setF({ ...f, kgDm: e.target.value })} />
        </Field>
        <Field label={t("ui.feedlotHead")}>
          <Input type="number" min={1} step={1} value={f.head} onChange={(e) => setF({ ...f, head: e.target.value })} />
        </Field>
        {corrals.length === 0 && <p className="col-span-2 text-sm text-tinta-2">{t("ui.feedlotNoCorrals")}</p>}
        {lines.length > 0 && (
          <ul className="num col-span-2 text-sm text-tinta-2">
            {lines.map((l) => (
              <li key={l.productId}>
                {nameOf(l.productId)}: {fmtNum(l.kg)} kg
              </li>
            ))}
          </ul>
        )}
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending || !plotId || !ration || lines.length === 0}>
            {t("ui.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CorralReport() {
  const farms = useFarms();
  const today = localDate(Date.now());
  const [f, setF] = useState({ farmId: "", from: localDate(Date.now() - 60 * 86_400_000), to: today });
  const q = useQuery({
    queryKey: ["erp", "feedlot", "report", f],
    queryFn: () => get<{ truncated: boolean; corrals: Corral[] }>(`/org/erp/feedlot/report${qs({ farmId: f.farmId || undefined, from: f.from, to: f.to })}`),
  });
  const rows = q.data?.corrals ?? [];
  return (
    <section className="flex flex-col gap-3" aria-labelledby="corral-h">
      <h2 id="corral-h" className="border-b border-linea pb-2 text-[18px] leading-6 font-semibold">
        {t("ui.feedlotReport")}
      </h2>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t("ui.costFarm")}>
          <Select value={f.farmId} onChange={(e) => setF({ ...f, farmId: e.target.value })} options={[{ value: "", label: t("ui.all") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <Field label={t("ui.costFrom")}>
          <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </Field>
        <Field label={t("ui.costTo")}>
          <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </Field>
      </div>
      {q.isLoading && <Spinner />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && rows.length === 0 && <Empty>{t("ui.feedlotNoFeeds")}</Empty>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <ExportableTable name="feedlot">
            <table className="w-full text-sm">
              <thead className="text-left text-tinta-2">
                <tr>
                  <th className="py-2 pr-4 font-medium">{t("ui.feedlotCorral")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.feedlotColDm")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.feedlotColAsFed")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.feedlotColGain")}</th>
                  <th className="py-2 text-right font-medium">{t("ui.feedlotColConversion")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.plotId} className="border-t border-linea align-top">
                    <td className="py-2.5 pr-4 font-medium">{c.plotName}</td>
                    <td className="num py-2.5 pr-4 text-right">{fmtNum(c.feedKgDm)}</td>
                    <td className="num py-2.5 pr-4 text-right">{fmtNum(c.feedKgAsFed)}</td>
                    <td className="num py-2.5 pr-4 text-right">{c.gainKg !== null ? `${fmtNum(c.gainKg)} kg` : "—"}</td>
                    <td className="num py-2.5 text-right">
                      {c.conversion !== null ? (
                        <>
                          {fmtNum(c.conversion)}
                          <span className="block text-xs text-tinta-2">
                            {t("ui.feedlotWindow", { from: fmtDate(c.firstAt!), to: fmtDate(c.lastAt!), head: c.head ?? 0 })}
                          </span>
                        </>
                      ) : (
                        <span className="text-tinta-2">{tk(`ui.feedlotStatus_${c.status}`)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
        </div>
      )}
      {q.data?.truncated && <p className="text-xs text-tinta-2">{t("ui.feedlotTruncated")}</p>}
      <p className="text-xs text-tinta-2">{t("ui.feedlotReportHint")}</p>
    </section>
  );
}
