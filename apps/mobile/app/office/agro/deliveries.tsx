/** Entregas de cosecha al acopio: lectura y alta con el neto calculado. GET/POST /org/farms/:id/deliveries. */
import { useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { BASE_MOISTURE_PCT, CROPS, grainNet, localDate, t, type MessageKey } from "@yvy/shared";
import { getDb } from "../../../src/lib/db";
import { showToast } from "../../../src/lib/toast";
import { useLocal } from "../../../src/lib/useLocal";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtNumber, parseDecimal } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { DataList, DateField, FormSheet, SelectField, StatRow, TextField } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { T } from "../../../src/ui/theme";

type Crop = (typeof CROPS)[number];
interface Delivery {
  id: string;
  plotName: string | null;
  crop: Crop;
  ticket: string;
  silo: string;
  deliveredOn: string;
  grossKg: number;
  moisturePct: number | null;
  netKg: number;
}
interface Resp {
  rows: Delivery[];
  byPlot: { plotId: string; plotName: string; grossKg: number; netKg: number; deliveries: number; harvestTons: number | null }[];
}
const tons = (kg: number) => fmtNumber(Math.round(kg / 10) / 100, 2);
const dmy = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const blank = (crop: Crop, plotId: string) => ({ plotId, crop: crop as string, ticket: "", silo: "", deliveredOn: localDate(Date.now()), grossKg: "", moisturePct: "", baseMoisturePct: String(BASE_MOISTURE_PCT[crop]), impuritiesPct: "0", otherKg: "0" });

/** Entregas de cosecha a acopios. */
export default function Deliveries() {
  const { farms, farm, setFarmId } = useFarmPick();
  const path = farm ? `/org/farms/${farm.id}/deliveries` : null;
  const q = useOnline<Resp>(path);
  const cropPlots = useLocal(() => (farm ? getDb().plots(farm.id).filter((p) => p.kind === "crop") : []), [farm?.id]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank("soja", ""));
  const [formError, setFormError] = useState<string | null>(null);
  const save = useOnlineMutation<Record<string, unknown>, unknown>("POST", path ?? "", { invalidate: path ? [path] : [] });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const num = (v: string) => (v.trim() === "" ? null : parseDecimal(v));
  const gross = num(f.grossKg);
  const preview = gross && gross > 0 ? grainNet({ grossKg: gross, moisturePct: num(f.moisturePct), baseMoisturePct: num(f.baseMoisturePct) ?? 13, impuritiesPct: num(f.impuritiesPct) ?? 0, otherKg: num(f.otherKg) ?? 0 }) : null;

  const openNew = () => {
    save.reset();
    setFormError(null);
    const p = cropPlots[0];
    setF(blank(((p?.crop as Crop | null) ?? "soja") as Crop, p?.id ?? ""));
    setOpen(true);
  };
  const submit = async () => {
    if (!f.ticket.trim()) return setFormError(t("office.deliv.needsTicket"));
    if (!f.silo.trim()) return setFormError(t("office.deliv.needsSilo"));
    if (!f.deliveredOn) return setFormError(t("office.deliv.needsDate"));
    if (!gross || gross <= 0) return setFormError(t("office.deliv.needsGross"));
    const moist = num(f.moisturePct);
    const base = num(f.baseMoisturePct);
    const imp = num(f.impuritiesPct);
    const other = num(f.otherKg);
    if ((f.moisturePct.trim() !== "" && moist === null) || base === null || (f.impuritiesPct.trim() !== "" && imp === null) || (f.otherKg.trim() !== "" && other === null)) return setFormError(t("office.deliv.badNumber"));
    setFormError(null);
    const r = await save.mutate({ plotId: f.plotId || null, crop: f.crop, ticket: f.ticket.trim(), silo: f.silo.trim(), deliveredOn: f.deliveredOn, grossKg: gross, moisturePct: moist, baseMoisturePct: base, impuritiesPct: imp ?? 0, otherKg: other ?? 0 });
    if (r.ok) {
      setOpen(false);
      showToast(t("ui.deliv.saved"));
    }
  };

  return (
    <FarmFrame title={t("ui.deliv.title")} subtitle={t("ui.deliv.intro")} farms={farms} farm={farm} setFarmId={setFarmId} query={q} action={{ label: t("ui.deliv.add"), icon: Plus, onPress: openNew }}>
      <OnlineState query={q} isEmpty={(d) => d.rows.length === 0} empty={{ title: t("office.deliv.noneTitle"), hint: t("office.deliv.noneHint") }}>
        {(d) => {
          const net = d.rows.reduce((n, r) => n + r.netKg, 0);
          const grossTotal = d.rows.reduce((n, r) => n + r.grossKg, 0);
          return (
            <View>
              <StatRow items={[{ label: t("office.deliv.totalNet"), value: tons(net) }, { label: t("office.deliv.totalGross"), value: tons(grossTotal) }]} />
              {d.byPlot.length > 0 && (
                <>
                  <SectionHeader title={t("ui.common.plots")} />
                  <DataList
                    rows={d.byPlot}
                    keyOf={(p) => p.plotId}
                    title={(p) => p.plotName}
                    subtitle={(p) => [t("ui.deliv.byPlot", { n: p.deliveries, net: `${tons(p.netKg)} t`, gross: `${tons(p.grossKg)} t` }), p.harvestTons !== null ? t("ui.deliv.harvested", { t: fmtNumber(p.harvestTons) }) : null].filter(Boolean).join(" · ")}
                    empty={{ title: t("office.deliv.noneTitle") }}
                  />
                </>
              )}
              <SectionHeader title={t("office.deliv.totals")} />
              <DataList
                rows={d.rows}
                keyOf={(r) => r.id}
                title={(r) => `${t("ui.deliv.ticket")} ${r.ticket} · ${r.silo}`}
                subtitle={(r) => [dmy(r.deliveredOn), r.plotName, t(`fields.crop.${r.crop}` as MessageKey), `${t("ui.deliv.gross")} ${tons(r.grossKg)} t`, r.moisturePct === null ? null : `${fmtNumber(r.moisturePct)} %`].filter(Boolean).join(" · ")}
                right={(r) => t("office.deliv.netLine", { net: tons(r.netKg) })}
                empty={{ title: t("office.deliv.noneTitle") }}
              />
            </View>
          );
        }}
      </OnlineState>
      <FormSheet visible={open} title={t("office.deliv.formTitle")} onClose={() => setOpen(false)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={save.pending} error={formError ?? save.error}>
        <SelectField label={t("ui.common.plot")} value={f.plotId} options={[{ value: "", label: "—" }, ...cropPlots.map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => set({ plotId: v })} />
        <SelectField
          label={t("ui.common.crop")}
          value={f.crop}
          options={CROPS.map((c) => ({ value: c as string, label: t(`fields.crop.${c}` as MessageKey) }))}
          onChange={(v) => set({ crop: v, baseMoisturePct: String(BASE_MOISTURE_PCT[v as Crop]) })}
        />
        <TextField label={t("ui.deliv.ticket")} value={f.ticket} onChangeText={(v) => set({ ticket: v })} maxLength={40} />
        <TextField label={t("ui.deliv.silo")} value={f.silo} onChangeText={(v) => set({ silo: v })} maxLength={120} />
        <DateField label={t("ui.deliv.date")} value={f.deliveredOn} onChange={(v) => set({ deliveredOn: v })} />
        <TextField label={t("ui.deliv.grossKg")} value={f.grossKg} onChangeText={(v) => set({ grossKg: v })} kind="decimal" />
        <TextField label={t("ui.deliv.moisturePct")} value={f.moisturePct} onChangeText={(v) => set({ moisturePct: v })} kind="decimal" />
        <TextField label={t("ui.deliv.basePct")} value={f.baseMoisturePct} onChangeText={(v) => set({ baseMoisturePct: v })} kind="decimal" />
        <TextField label={t("ui.deliv.impurities")} value={f.impuritiesPct} onChangeText={(v) => set({ impuritiesPct: v })} kind="decimal" />
        <TextField label={t("ui.deliv.otherKg")} value={f.otherKg} onChangeText={(v) => set({ otherKg: v })} kind="decimal" />
        {preview && <Text style={[T.bodyMedium, { marginTop: 16 }]}>{t("ui.deliv.preview", { net: `${tons(preview.netKg)} t`, moist: fmtNumber(preview.moistureKg), imp: fmtNumber(preview.impuritiesKg) })}</Text>}
      </FormSheet>
    </FarmFrame>
  );
}
