/**
 * Calendario sanitario (función 102): eventos del mes con estado (atrasado en peligro), planificar un tratamiento (con tareas para
 * los empleados) y borrarlo. GET/POST /org/sanitary-events, DELETE /org/sanitary-events/:id.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react-native";
import { HEALTH_REASONS, HERD_CATEGORIES, isFieldRole, localDate, senacsaNote, senacsaPlanDate, t, type HerdCategory, type SenacsaCampaign, type SenacsaResponse, type MessageKey } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { tap } from "../../src/lib/haptics";
import { getSession } from "../../src/lib/session";
import { syncNow } from "../../src/lib/sync";
import { showToast } from "../../src/lib/toast";
import { useLocal } from "../../src/lib/useLocal";
import { fmtDate } from "../../src/office/format";
import { NeedsSignalNote, useOnlineFlag } from "../../src/office/hub";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { useOnline } from "../../src/office/useOnline";
import { useOnlineMutation } from "../../src/office/useOnlineMutation";
import { DataList, DateField, FormSheet, SelectField, TextField } from "../../src/office/ui";
import { Button, EmptyState, Row, Sheet, SwitchRow, Text } from "../../src/ui/kit";
import { C, RADIUS, T, TOUCH } from "../../src/ui/theme";
import type { SanitaryEventRow as EventRow } from "@yvy/shared";

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-PY", { month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const dmy = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
const reasonName = (r: string) => t(`fields.health.reason_${r}` as MessageKey);

const blank = (date: string) => ({ reason: "aftosa", plannedDate: date, farmId: "", product: "", note: "", createTasks: true, cats: [] as HerdCategory[] });

function MonthStep({ dir, onPress }: { dir: -1 | 1; onPress: () => void }) {
  const Icon = dir < 0 ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(dir < 0 ? "ui.sanitary.prev" : "ui.sanitary.next")}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({ width: TOUCH, height: TOUCH, borderRadius: RADIUS, borderWidth: 1.5, borderColor: C.lineaFuerte, backgroundColor: C.blanco, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
    >
      <Icon size={24} color={C.tinta} strokeWidth={2} />
    </Pressable>
  );
}

export default function Sanitary() {
  const allowed = !isFieldRole(getSession()?.organization.role ?? "");
  const online = useOnlineFlag();
  const today = localDate(Date.now());
  const [month, setMonth] = useState(today.slice(0, 7));
  const path = `/org/sanitary-events?month=${month}`;
  const q = useOnline<EventRow[]>(allowed ? path : null);
  const farms = useLocal(() => getDb().farms());
  const farmName = (id: string | null) => (id ? (farms.find((f) => f.id === id)?.name ?? "") : t("ui.sanitary.allFarms"));
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank(today));
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<EventRow | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, { tasksCreated: number }>("POST", "/org/sanitary-events", { invalidate: ["/org/sanitary-events", "/org/tasks"] });
  const remove = useOnlineMutation<{ id: string }, unknown>("DELETE", (b) => `/org/sanitary-events/${b.id}`, { invalidate: ["/org/sanitary-events"] });
  const year = Number(today.slice(0, 4));
  const senacsa = useOnline<SenacsaResponse>(allowed ? `/org/senacsa?year=${year}` : null);
  const planCampaign = useOnlineMutation<Record<string, unknown>, { tasksCreated: number }>("POST", "/org/sanitary-events", { invalidate: ["/org/sanitary-events", "/org/senacsa", "/org/tasks"] });
  const planSenacsa = async (c: SenacsaCampaign) => {
    const r = await planCampaign.mutate({ reason: c.reason, plannedDate: senacsaPlanDate(c, today), farmId: farms.length === 1 ? farms[0]!.id : null, categories: c.categories, note: senacsaNote(c), createTasks: true });
    if (r.ok) {
      showToast(t("ui.senacsa.planSaved"));
      if (r.data.tasksCreated > 0) void syncNow();
      void senacsa.refresh();
    } else showToast(r.error);
  };
  const openCampaigns = (senacsa.data?.campaigns ?? []).filter((c) => c.to >= today);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  if (!allowed) return <OfficeScreen title={t("ui.sanitary.title")}><EmptyState title={t("ui.sanitary.noAccess")} /></OfficeScreen>;

  const openNew = () => {
    create.reset();
    setFormError(null);
    setF(blank(month === today.slice(0, 7) ? today : `${month}-01`));
    setOpen(true);
  };
  const submit = async () => {
    if (!f.plannedDate) return setFormError(t("office.sanitary.needsDate"));
    setFormError(null);
    const r = await create.mutate({ reason: f.reason, plannedDate: f.plannedDate, farmId: f.farmId || null, categories: f.cats, product: f.product.trim() || null, note: f.note.trim() || null, createTasks: f.createTasks });
    if (r.ok) {
      setOpen(false);
      showToast(r.data.tasksCreated > 0 ? t("ui.sanitary.savedTasks", { n: r.data.tasksCreated }) : t("ui.sanitary.saved"));
      if (r.data.tasksCreated > 0) void syncNow();
    }
  };
  const doRemove = async () => {
    if (!removing) return;
    const r = await remove.mutate({ id: removing.id });
    if (r.ok) {
      setRemoving(null);
      showToast(t("office.sanitary.deleted"));
    }
  };

  return (
    <OfficeScreen title={t("ui.sanitary.title")} query={q} action={{ label: t("ui.sanitary.new"), icon: Plus, onPress: openNew, disabled: !online }}>
      <NeedsSignalNote />
      {openCampaigns.length > 0 && (
        <View style={{ marginTop: 16, gap: 8 }}>
          <Text style={T.heading}>{t("ui.senacsa.title")}</Text>
          {openCampaigns.map((c) => (
            <View key={c.id} style={{ borderWidth: 1, borderColor: C.linea, borderRadius: RADIUS, padding: 12, gap: 4 }}>
              <Text style={[T.smallMedium, { color: C.accionOscuro }]}>{t("ui.senacsa.badge")}</Text>
              <Text style={T.bodyMedium}>
                {t(`ui.senacsa.name_${c.reason}` as MessageKey) + " · " + t("ui.senacsa.period", { n: c.period })}
              </Text>
              <Text style={T.small}>
                {t("ui.senacsa.dates", { from: dmy(c.from), to: dmy(c.to) }) +
                  (c.registerUntil ? " · " + t("ui.senacsa.register", { date: dmy(c.registerUntil) }) : "")}
              </Text>
              <Text style={T.small}>{c.appliesTo}</Text>
              {senacsa.data!.planned.includes(c.id) ? (
                <Text style={[T.smallMedium, { color: C.accionOscuro }]}>{t("ui.senacsa.planned")}</Text>
              ) : (
                <Button kind="secondary" title={t("ui.senacsa.plan")} loading={planCampaign.pending} disabled={!online} onPress={() => planSenacsa(c)} />
              )}
            </View>
          ))}
          <Text style={T.small}>{t("ui.senacsa.disclaimer")}</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <MonthStep dir={-1} onPress={() => setMonth(shiftMonth(month, -1))} />
        <Text accessibilityLiveRegion="polite" style={T.heading}>
          {monthLabel(month)}
        </Text>
        <MonthStep dir={1} onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>
      <OnlineState query={q} empty={{ title: t("ui.sanitary.empty"), hint: t("ui.sanitary.emptyHint") }}>
        {(rows) => (
          <DataList
            rows={[...rows].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))}
            keyOf={(e) => e.id}
            title={(e) => `${reasonName(e.reason)}${e.product ? `: ${e.product}` : ""}`}
            subtitle={(e) =>
              [dmy(e.plannedDate), farms.length > 1 ? farmName(e.farmId) : null, e.categories.map((c) => t(`fields.herd.${c}` as MessageKey).toLowerCase()).join(", "), e.tasksCreated > 0 ? t("ui.sanitary.tasks", { n: e.tasksCreated }) : null, e.note]
                .filter(Boolean)
                .join(" · ")
            }
            right={(e) =>
              e.state === "overdue" ? (
                <Text style={{ color: C.peligro, textAlign: "right" }}>{t("ui.sanitary.state_overdue")}</Text>
              ) : e.state === "done" && e.doneAt ? (
                <Text style={[T.smallMedium, { color: C.accionOscuro, textAlign: "right" }]}>{t("ui.sanitary.doneOn", { date: fmtDate(e.doneAt) })}</Text>
              ) : null
            }
            onPress={(e) => {
              remove.reset();
              setRemoving(e);
            }}
            empty={{ title: t("ui.sanitary.empty") }}
          />
        )}
      </OnlineState>

      <FormSheet visible={open} title={t("ui.sanitary.new")} onClose={() => setOpen(false)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={create.pending} error={formError ?? create.error}>
        <SelectField label={t("fields.health.reason")} value={f.reason} options={HEALTH_REASONS.map((r) => ({ value: r as string, label: reasonName(r) }))} onChange={(v) => set({ reason: v })} />
        <DateField label={t("ui.due.date")} value={f.plannedDate} onChange={(v) => set({ plannedDate: v })} />
        <SelectField label={t("ui.common.farm")} value={f.farmId} options={[{ value: "", label: t("ui.sanitary.allFarms") }, ...farms.map((x) => ({ value: x.id, label: x.name }))]} onChange={(v) => set({ farmId: v })} />
        <Text style={[T.smallMedium, { marginTop: 16 }]}>{t("ui.sanitary.categories")}</Text>
        <Text style={T.small}>{t("ui.sanitary.categoriesHint")}</Text>
        {HERD_CATEGORIES.map((c) => (
          <Row key={c} choice="checkbox" title={t(`fields.herd.${c}` as MessageKey)} selected={f.cats.includes(c)} onPress={() => set({ cats: f.cats.includes(c) ? f.cats.filter((x) => x !== c) : [...f.cats, c] })} />
        ))}
        <TextField label={t("fields.common.product")} hint={t("office.sanitary.productHint")} value={f.product} onChangeText={(v) => set({ product: v })} maxLength={120} />
        <TextField label={t("app.common.note")} value={f.note} onChangeText={(v) => set({ note: v })} maxLength={500} />
        <SwitchRow title={t("ui.sanitary.createTasks")} value={f.createTasks} onValueChange={(v) => set({ createTasks: v })} />
      </FormSheet>

      <Sheet visible={!!removing} title={t("office.sanitary.deleteTitle")} onClose={() => setRemoving(null)}>
        {removing && (
          <>
            <Text style={T.bodyMedium}>{`${reasonName(removing.reason)} · ${dmy(removing.plannedDate)}`}</Text>
            <Text style={[T.small, { marginTop: 4 }]}>{t("office.sanitary.deleteBody")}</Text>
            {remove.error ? (
              <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 16 }]}>
                {remove.error}
              </Text>
            ) : null}
            <Button kind="danger" title={t("ui.common.delete")} loading={remove.pending} disabled={!online} onPress={doRemove} style={{ marginTop: 20 }} />
            <Button kind="text" title={t("ui.common.cancel")} onPress={() => setRemoving(null)} style={{ marginTop: 4 }} />
          </>
        )}
      </Sheet>
    </OfficeScreen>
  );
}
