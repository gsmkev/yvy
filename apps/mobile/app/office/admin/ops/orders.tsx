/**
 * Órdenes de trabajo (función 123): abiertas y cerradas, detalle, alta y cierre. Una orden es una tarea por lote
 * (GET/POST /org/erp/work-orders). Se cierra sola cuando el operario carga su registro de campo con foto y ubicación (la API
 * no deja marcarla hecha desde la oficina); desde acá se cancela (PATCH /org/tasks/:id con status cancelled).
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { DOSE_UNITS_FOR, localDate, ORDER_LABORS, t, type MessageKey, groupOrders, plotsLabel, productsLabel, type OrderGroup, type OrderRow } from "@yvy/shared";
import { getDb } from "../../../../src/lib/db";
import { syncNow } from "../../../../src/lib/sync";
import { showToast } from "../../../../src/lib/toast";
import { useLocal } from "../../../../src/lib/useLocal";
import { isoShort, NoAdminAccess, NoSignalNote, useErp, useManageErp, useNoSignalReason, useSeasonList } from "../../../../src/office/erpCommon";
import { fmtNumber, parseDecimal } from "../../../../src/office/format";
import { fmtGs } from "../../../../src/office/money";
import { OfficeScreen } from "../../../../src/office/OfficeScreen";
import { OnlineState } from "../../../../src/office/state";
import type { Member } from "../../../../src/office/team";
import { useOnlineMutation } from "../../../../src/office/useOnlineMutation";
import { DataList, DateField, FormSheet, KeyValue, Segmented, SelectField, TextField } from "../../../../src/office/ui";
import { Button, Row, Sheet, Text } from "../../../../src/ui/kit";
import { C, T } from "../../../../src/ui/theme";

const key = (k: string) => k as MessageKey;
type Tab = "open" | "closed";
const ha = (n: number | null) => (n === null ? null : `${fmtNumber(n)} ha`);

export default function Orders() {
  const allowed = useManageErp();
  const [tab, setTab] = useState<Tab>("open");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const noSignal = useNoSignalReason();
  const q = useErp<OrderRow[]>(allowed ? "/org/erp/work-orders" : null);
  const groups = useMemo(() => groupOrders(q.data ?? []), [q.data]);
  const farms = useLocal(() => getDb().farms());
  if (!allowed) return <NoAdminAccess title={t("ui.adminSection_orders")} />;
  const farmName = (id: string) => farms.find((f) => f.id === id)?.name ?? "";
  const open = groups.filter((g) => g.status === "open");
  const closed = groups.filter((g) => g.status !== "open");
  const shown = tab === "open" ? open : closed;
  const current = groups.find((g) => g.key === detail) ?? null;

  return (
    <OfficeScreen
      title={t("ui.adminSection_orders")}
      query={q}
      action={{ label: t("ui.orderNew"), icon: Plus, onPress: () => setCreating(true), disabled: !!noSignal }}
      footer={<NoSignalNote />}
    >
      <OnlineState query={q} isEmpty={(d) => d.length === 0} empty={{ title: t("ui.orderEmptyTitle"), hint: t("ui.orderEmptyHint") }}>
        {() => (
          <>
            <View style={{ marginTop: 16 }}>
              <Segmented<Tab>
                options={[
                  { value: "open", label: `${t("office.ordersOpen")} · ${open.length}` },
                  { value: "closed", label: `${t("office.ordersClosed")} · ${closed.length}` },
                ]}
                value={tab}
                onChange={setTab}
              />
            </View>
            <DataList
              rows={shown}
              keyOf={(g) => g.key}
              title={(g) => `${t(key(`ui.orderLabor_${g.labor}`))} · ${plotsLabel(g.plotNames)}`}
              subtitle={(g) => [isoShort(g.dueDate), g.contractorName ?? g.assigneeName, farmName(g.farmId)].filter(Boolean).join(" · ")}
              right={(g) => <Text style={[T.smallMedium, { color: g.status === "open" && g.done > 0 ? C.accionOscuro : C.tinta2 }]}>{g.status === "open" ? (g.done > 0 ? t("ui.orderProgress", { done: g.done, total: g.rows.length }) : t("ui.orderStatus_open")) : t(key(`ui.orderStatus_${g.status}`))}</Text>}
              onPress={(g) => setDetail(g.key)}
              empty={{ title: tab === "open" ? t("office.ordersNoOpen") : t("office.ordersNoClosed") }}
            />
          </>
        )}
      </OnlineState>
      {creating ? <OrderSheet onClose={() => setCreating(false)} onCreated={() => void syncNow()} /> : null}
      {current ? <DetailSheet group={current} farm={farmName(current.farmId)} onClose={() => setDetail(null)} onClosed={() => void q.refresh()} /> : null}
    </OfficeScreen>
  );
}

function DetailSheet({ group: g, farm, onClose, onClosed }: { group: OrderGroup; farm: string; onClose: () => void; onClosed: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rows: { label: string; value: string }[] = [
    { label: t("ui.costFarm"), value: farm },
    { label: t("ui.orderDue"), value: isoShort(g.dueDate) },
    { label: t("ui.orderPlots"), value: g.plotNames.join(", ") },
    { label: t("ui.orderAssignee"), value: g.assigneeName ?? "—" },
    ...(g.contractorName ? [{ label: t("ui.orderContractor"), value: g.contractorName }] : []),
    ...(g.machine ? [{ label: t("ui.orderMachine"), value: g.machine }] : []),
    ...(productsLabel(g.order) ? [{ label: t("ui.orderProducts"), value: g.order.products.map((p) => productsLabel({ ...g.order, products: [p] })).join("\n") }] : []),
    ...(ha(g.plannedHa) ? [{ label: t("ui.orderPlanned"), value: ha(g.plannedHa)! }] : []),
    ...(ha(g.actualHa) ? [{ label: t("ui.orderActual"), value: ha(g.actualHa)! }] : []),
    ...(g.costPyg !== undefined && g.done > 0 ? [{ label: t("ui.orderCost"), value: fmtGs(g.costPyg) }] : []),
    ...(g.order.note ? [{ label: t("ui.orderNote"), value: g.order.note }] : []),
    { label: t("ui.orderStatus"), value: g.status === "open" && g.done > 0 ? t("ui.orderProgress", { done: g.done, total: g.rows.length }) : t(key(`ui.orderStatus_${g.status}`)) },
  ];
  const cancel = useOnlineMutation<{ id: string; status: string }, unknown>("PATCH", (b) => `/org/tasks/${b.id}`);
  const cancelOrder = async () => {
    setBusy(true);
    setError(null);
    for (const r of g.rows.filter((x) => x.status === "open")) {
      const res = await cancel.mutate({ id: r.id, status: "cancelled" });
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        onClosed();
        return;
      }
    }
    setBusy(false);
    showToast(t("office.ordersClosedToast"));
    void syncNow();
    onClosed();
    onClose();
  };
  return (
    <Sheet visible title={t(key(`ui.orderLabor_${g.labor}`))} onClose={onClose}>
      <KeyValue rows={rows} />
      {g.status === "open" ? (
        <>
          <Text style={[T.small, { marginTop: 12 }]}>{t("office.ordersCloseHint")}</Text>
          {error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>{error}</Text> : null}
          <Button kind="danger" title={t("office.ordersClose")} onPress={() => void cancelOrder()} loading={busy} style={{ marginTop: 16 }} />
        </>
      ) : null}
      <Button kind="text" title={t("ui.close")} onPress={onClose} style={{ marginTop: 4 }} />
    </Sheet>
  );
}

interface Dose {
  productId: string;
  dose: string;
  unit: string;
}
interface Named {
  id: string;
  name: string;
}

function OrderSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const farms = useLocal(() => getDb().farms());
  const allPlots = useLocal(() => getDb().plots());
  const products = useLocal(() => getDb().products());
  const members = useErp<Member[]>("/org/members");
  const machines = useErp<Named[]>("/org/erp/machines");
  const contractors = useErp<Named[]>("/org/erp/contractors");
  const seasons = useSeasonList();
  const [f, setF] = useState({ farmId: farms[0]?.id ?? "", labor: "spraying", assigneeId: "", dueDate: localDate(Date.now()), areaHa: "", machineId: "", contractorId: "", seasonId: "" });
  const [plotIds, setPlotIds] = useState<string[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = useOnlineMutation<Record<string, unknown>, { ids: string[] }>("POST", "/org/erp/work-orders", { invalidate: ["/org/erp/work-orders"] });
  const plots = allPlots.filter((p) => p.farmId === f.farmId);
  const assignee = f.assigneeId || members.data?.[0]?.userId || "";
  const none = { value: "", label: t("ui.orderNoneOpt") };
  const withInputs = f.labor === "spraying" || f.labor === "fertilizing";
  const addDose = () => {
    const p = products[0];
    if (p) setDoses((d) => [...d, { productId: p.id, dose: "", unit: f.labor === "fertilizing" ? "kg_ha" : DOSE_UNITS_FOR[p.unit][0] }]);
  };
  const upd = (i: number, patch: Partial<Dose>) => setDoses((d) => d.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    if (!plotIds.length) return setError(t("ui.orderNoPlots"));
    if (!f.dueDate) return setError(t("office.invalidDate"));
    if (!assignee) return setError(t("office.taskNeedsAssignee"));
    const area = f.areaHa ? parseDecimal(f.areaHa) : null;
    if (f.areaHa && (area === null || area <= 0)) return setError(t("office.ordersBadArea"));
    setError(null);
    const order = {
      labor: f.labor,
      ...(area ? { areaHa: area } : {}),
      products: withInputs
        ? doses.flatMap((d) => {
            const n = parseDecimal(d.dose);
            return d.productId && n && n > 0 ? [{ productId: d.productId, name: products.find((p) => p.id === d.productId)?.name ?? "", dose: n, unit: d.unit }] : [];
          })
        : [],
      ...(f.machineId ? { machineId: f.machineId } : {}),
      ...(f.contractorId ? { contractorId: f.contractorId } : {}),
      ...(f.seasonId ? { seasonId: f.seasonId } : {}),
    };
    const r = await save.mutate({ farmId: f.farmId, plotIds, assigneeId: assignee, dueDate: f.dueDate, order });
    if (r.ok) {
      showToast(t("ui.erpSaved"));
      onCreated();
      onClose();
    }
  };

  return (
    <FormSheet visible title={t("ui.orderNew")} onClose={onClose} onSubmit={submit} submitLabel={t("ui.save")} pending={save.pending} error={error ?? save.error}>
      <SelectField label={t("ui.orderLabor")} value={f.labor} options={ORDER_LABORS.map((x) => ({ value: x, label: t(key(`ui.orderLabor_${x}`)) }))} onChange={(v) => set({ labor: v })} />
      <DateField label={t("ui.orderDue")} value={f.dueDate} onChange={(v) => set({ dueDate: v })} />
      <SelectField label={t("ui.costFarm")} value={f.farmId} options={farms.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => (set({ farmId: v }), setPlotIds([]))} />
      <Text style={[T.smallMedium, { marginTop: 16, marginBottom: 6 }]}>{t("ui.orderPlots")}</Text>
      {plots.length === 0 ? <Text style={T.small}>{t("office.ordersFarmNoPlots")}</Text> : null}
      {plots.map((p) => (
        <Row key={p.id} choice="checkbox" title={p.name} subtitle={p.areaHa ? `${fmtNumber(p.areaHa)} ha` : undefined} selected={plotIds.includes(p.id)} onPress={() => setPlotIds((ids) => (ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id]))} right={plotIds.includes(p.id) ? <Text style={[T.bodyMedium, { color: C.accionOscuro }]}>✓</Text> : undefined} />
      ))}
      <SelectField label={t("ui.orderAssignee")} value={assignee} options={(members.data ?? []).map((m) => ({ value: m.userId, label: m.fullName }))} onChange={(v) => set({ assigneeId: v })} />
      <TextField label={t("ui.orderArea")} hint={t("ui.orderAreaHint")} value={f.areaHa} onChangeText={(v) => set({ areaHa: v })} kind="decimal" />
      <SelectField label={t("ui.orderMachine")} value={f.machineId} options={[none, ...(machines.data ?? []).map((m) => ({ value: m.id, label: m.name }))]} onChange={(v) => set({ machineId: v })} />
      <SelectField label={t("ui.orderContractor")} value={f.contractorId} options={[none, ...(contractors.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} onChange={(v) => set({ contractorId: v })} />
      <SelectField label={t("ui.season")} value={f.seasonId} options={[none, ...(seasons.data?.seasons ?? []).map((x) => ({ value: x.id, label: x.name }))]} onChange={(v) => set({ seasonId: v })} />
      {withInputs ? (
        <>
          <Text style={[T.smallMedium, { marginTop: 16 }]}>{t("ui.orderProducts")}</Text>
          {doses.map((d, i) => (
            <View key={i} style={{ marginTop: 4 }}>
              <SelectField label={t("ui.orderProduct")} value={d.productId} options={products.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => upd(i, { productId: v })} />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <TextField label={t("ui.orderDose")} value={d.dose} onChangeText={(v) => upd(i, { dose: v })} kind="decimal" />
                </View>
                <View style={{ flex: 1 }}>
                  <SelectField label={t("office.ordersUnit")} value={d.unit} options={["l_ha", "ml_ha", "kg_ha", "g_ha"].map((u) => ({ value: u, label: u.replace("_", "/") }))} onChange={(v) => upd(i, { unit: v })} />
                </View>
              </View>
              <Button kind="text" title={t("office.ordersRemoveInput")} onPress={() => setDoses((x) => x.filter((_, k) => k !== i))} />
            </View>
          ))}
          {products.length > 0 ? <Button kind="secondary" title={t("ui.orderProductAdd")} onPress={addDose} style={{ marginTop: 8 }} /> : null}
        </>
      ) : null}
    </FormSheet>
  );
}
