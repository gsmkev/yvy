/**
 * Receta agronómica (A-11, función 60): lotes, productos y dosis, enviada como una tarea de aplicación por lote a un
 * empleado. `POST /org/prescriptions` (como la web); necesita señal. La tarea llega al celular del empleado con el sync.
 */
import { useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { DOSE_UNITS_FOR, isFieldRole, localDate, t, type DoseUnit, type MessageKey } from "@yvy/shared";
import type { Farm, Plot, Product } from "../db/store";
import { syncNow } from "../lib/sync";
import { showToast } from "../lib/toast";
import { Button, Row, SectionHeader, Text } from "../ui/kit";
import { T } from "../ui/theme";
import { parseDecimal } from "./format";
import { type Member } from "./team";
import { DateField, FormSheet, SelectField, TextField } from "./ui";
import { useOnline } from "./useOnline";
import { useOnlineMutation } from "./useOnlineMutation";

const k = (s: string) => s as MessageKey;

interface Line {
  productId: string;
  dose: string;
  unit: DoseUnit;
}

export function PrescriptionSheet({ visible, onClose, farms, plots, products, seasons }: { visible: boolean; onClose: () => void; farms: Farm[]; plots: Plot[]; products: Product[]; seasons: { id: string; name: string }[] }) {
  const [farmPick, setFarmPick] = useState<string | null>(null);
  const farmId = farms.find((x) => x.id === farmPick)?.id ?? farms[0]?.id ?? "";
  const members = useOnline<Member[]>(visible ? "/org/members" : null);
  const [lines, setLines] = useState<Line[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [f, setF] = useState({ assigneeId: "", dueDate: localDate(Date.now()), volume: "", seasonId: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/prescriptions", { invalidate: ["/org/members"] });
  const cropPlots = plots.filter((p) => p.kind === "crop" && p.farmId === farmId);
  const workers = (members.data ?? []).filter((m) => isFieldRole(m.role));

  const addLine = () => {
    const p = products[0];
    if (p) setLines([...lines, { productId: p.id, dose: "", unit: DOSE_UNITS_FOR[p.unit][0] }]);
  };
  const patchLine = (i: number, v: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...v } : l)));

  const submit = async () => {
    if (picked.length === 0) return setError(t("office.rxNeedsPlots"));
    if (lines.length === 0) return setError(t("office.rxNeedsProducts"));
    if (lines.some((l) => !((parseDecimal(l.dose) ?? 0) > 0))) return setError(t("office.rxNeedsDose"));
    if (!f.assigneeId) return setError(t("office.taskNeedsAssignee"));
    if (!f.dueDate) return setError(t("office.taskNeedsDate"));
    const volume = f.volume.trim() ? parseDecimal(f.volume) : null;
    if (f.volume.trim() && (volume === null || volume <= 0)) return setError(t("office.seasonBadNumber"));
    setError(null);
    const r = await create.mutate({
      farmId,
      plotIds: picked,
      assigneeId: f.assigneeId,
      dueDate: f.dueDate,
      prescription: {
        seasonId: f.seasonId || undefined,
        volumeLHa: volume ?? undefined,
        note: f.note.trim() || undefined,
        products: lines.map((l) => ({ productId: l.productId, name: products.find((p) => p.id === l.productId)?.name ?? "", dose: parseDecimal(l.dose)!, unit: l.unit })),
      },
    });
    if (r.ok) {
      showToast(t("ui.toastPrescriptionSaved", { n: picked.length }));
      setLines([]);
      setPicked([]);
      onClose();
      void syncNow();
    }
  };

  return (
    <FormSheet visible={visible} title={t("ui.prescriptionNew")} onClose={onClose} onSubmit={submit} submitLabel={t("ui.prescriptionCreate")} pending={create.pending} error={error ?? create.error}>
      {farms.length > 1 ? <SelectField label={t("ui.farm")} value={farmId} options={farms.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => { setFarmPick(v); setPicked([]); }} /> : null}
      <SectionHeader first={farms.length < 2} title={t("ui.prescriptionPlots")} />
      {cropPlots.length === 0 ? <Text style={T.small}>{t("ui.noPlots")}</Text> : null}
      {cropPlots.map((p) => {
        const on = picked.includes(p.id);
        return <Row key={p.id} choice="checkbox" selected={on} title={p.name} subtitle={p.crop ? t(k(`ui.cropName_${p.crop}`)) : undefined} onPress={() => setPicked(on ? picked.filter((x) => x !== p.id) : [...picked, p.id])} />;
      })}

      <SectionHeader title={t("ui.prescriptionProducts")} />
      {products.length === 0 ? <Text style={T.small}>{t("ui.prescriptionNoProducts")}</Text> : null}
      {lines.map((l, i) => {
        const base = products.find((p) => p.id === l.productId)?.unit ?? "l";
        return (
          <View key={i} style={{ marginBottom: 8 }}>
            <SelectField
              label={t("ui.productName")}
              value={l.productId}
              options={products.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => {
                const p = products.find((x) => x.id === v);
                patchLine(i, { productId: v, unit: p ? DOSE_UNITS_FOR[p.unit][0] : l.unit });
              }}
            />
            <TextField label={t("ui.prescriptionDose")} kind="decimal" value={l.dose} onChangeText={(v) => patchLine(i, { dose: v })} />
            <SelectField label={t("ui.productUnit")} value={l.unit} options={DOSE_UNITS_FOR[base].map((u) => ({ value: u as string, label: t(k(`fields.doseUnit_${u}`)) })) as { value: DoseUnit; label: string }[]} onChange={(v) => patchLine(i, { unit: v })} />
            <Button kind="text" title={t("ui.delete")} onPress={() => setLines(lines.filter((_, j) => j !== i))} />
          </View>
        );
      })}
      <Button kind="secondary" icon={Plus} title={t("ui.prescriptionAddProduct")} disabled={products.length === 0} onPress={addLine} style={{ marginTop: 8 }} />

      <SectionHeader title={t("office.rxSend")} />
      <SelectField label={t("ui.assignee")} value={f.assigneeId} options={workers.map((m) => ({ value: m.userId, label: m.fullName }))} onChange={(v) => setF({ ...f, assigneeId: v })} placeholder={members.loading ? t("office.rxLoadingPeople") : workers.length === 0 ? t("office.rxNoWorkers") : undefined} />
      <DateField label={t("ui.dueDate")} value={f.dueDate} onChange={(v) => setF({ ...f, dueDate: v })} />
      <TextField label={t("fields.volumeLHa")} kind="decimal" value={f.volume} onChangeText={(v) => setF({ ...f, volume: v })} />
      {seasons.length > 0 ? <SelectField label={t("ui.season")} value={f.seasonId} options={[{ value: "", label: t("ui.none") }, ...seasons.map((s) => ({ value: s.id, label: s.name }))]} onChange={(v) => setF({ ...f, seasonId: v })} /> : null}
      <TextField label={t("app.note")} kind="multiline" value={f.note} onChangeText={(v) => setF({ ...f, note: v })} maxLength={2000} />
      <Text style={[T.small, { marginTop: 8 }]}>{t("ui.prescriptionHint")}</Text>
    </FormSheet>
  );
}

