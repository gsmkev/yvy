/** Existencias por potrero, UA y límite de carga. Se calcula con los conteos y movimientos del celular; el límite viene de la estancia. */
import { useState } from "react";
import { Settings2 } from "lucide-react-native";
import { DEFAULT_MAX_UA_PER_HA, MAX_UA_PER_HA_LIMITS, PRODUCTION_SYSTEMS, indicatorLabel, indicatorValueText, type ProductionResponse, type ProductionSystem, uaPerHa, t, type FarmStockResponse, type MessageKey } from "@yvy/shared";
import { showToast } from "../../../src/lib/toast";
import { getSession } from "../../../src/lib/session";
import { useUnits } from "../../../src/lib/units";
import { useLocal } from "../../../src/lib/useLocal";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtNumber, parseDecimal } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { herdRows, herdSubtitle, herdTotals, loadLine } from "../../../src/office/herdStock/model";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { DataList, FormSheet, SelectField, StatRow, TextField } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

/** Hacienda por potrero, calculada con los conteos del celular. */
export default function Stock() {
  const units = useUnits();
  const { farms, farm, setFarmId } = useFarmPick();
  const role = getSession()?.organization.role;
  const canEditLimit = role === "owner" || role === "admin";
  const remote = useOnline<FarmStockResponse>(farm ? `/org/farms/${farm.id}/stock` : null);
  const [open, setOpen] = useState(false);
  const [sysOpen, setSysOpen] = useState(false);
  const [sysPick, setSysPick] = useState<ProductionSystem | "">("");
  const prod = useOnline<ProductionResponse>(farm && remote.data?.system ? `/org/farms/${farm.id}/production` : null);
  const saveSys = useOnlineMutation<{ system: ProductionSystem }, unknown>("PUT", `/org/farms/${farm?.id}/livestock-settings`, { invalidate: [`/org/farms/${farm?.id}/stock`, `/org/farms/${farm?.id}/production`] });
  const [limitText, setLimitText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const save = useOnlineMutation<{ maxUaPerHa: number }, unknown>("PUT", `/org/farms/${farm?.id}/livestock-settings`, { invalidate: [`/org/farms/${farm?.id}/stock`] });

  const model = useLocal(() => (farm ? herdRows(farm.id) : null), [farm?.id]);

  const maxUa = remote.data?.maxUaPerHa ?? DEFAULT_MAX_UA_PER_HA;
  const rows = model ?? [];
  const { head, ua, farmUaHa, over } = herdTotals(rows, maxUa);

  const system = remote.data?.system ?? null;
  const remotePlot = new Map((remote.data?.plots ?? []).map((p) => [p.plotId, p]));
  const submitSys = async () => {
    if (!sysPick) return;
    const r = await saveSys.mutate({ system: sysPick });
    if (r.ok) {
      setSysOpen(false);
      showToast(t("ui.herd.sysSaved"));
      void remote.refresh();
    }
  };
  const submit = async () => {
    const v = parseDecimal(limitText);
    if (v === null || v < MAX_UA_PER_HA_LIMITS.min || v > MAX_UA_PER_HA_LIMITS.max) return setFormError(t("office.herd.stockLimitBad", { min: fmtNumber(MAX_UA_PER_HA_LIMITS.min), max: MAX_UA_PER_HA_LIMITS.max }));
    setFormError(null);
    const r = await save.mutate({ maxUaPerHa: v });
    if (r.ok) {
      setOpen(false);
      showToast(t("office.herd.stockLimitSaved"));
      void remote.refresh();
    }
  };

  return (
    <FarmFrame
      title={t("office.herd.stockTitle")}
      farms={farms}
      farm={farm}
      setFarmId={setFarmId}
      query={remote}
      action={canEditLimit && farm ? { label: t("office.herd.stockLimitEdit"), icon: Settings2, onPress: () => { save.reset(); setFormError(null); setLimitText(fmtNumber(maxUa, 2)); setOpen(true); } } : undefined}
    >
      {canEditLimit && farm && remote.data && (
        <>
          {!system && <Text style={T.bodyMedium}>{t("ui.herd.sysQuestion")}</Text>}
          {!system && <Text style={[T.small, { marginBottom: 8 }]}>{t("ui.herd.sysQuestionHint")}</Text>}
          <Text
            accessibilityRole="button"
            onPress={() => { saveSys.reset(); setSysPick(system ?? ""); setSysOpen(true); }}
            style={[T.bodyMedium, { color: C.accion, marginBottom: 8 }]}
          >
            {system ? `${t("ui.herd.sysLabel")}: ${t(`ui.herd.sys_${system}` as MessageKey)} · ${t("ui.herd.sysChange")}` : t("ui.herd.sysChange")}
          </Text>
        </>
      )}
      {system === "tambo" && <Text style={T.small}>{t("ui.herd.sysTamboNote")}</Text>}
      {(prod.data?.indicators.length ?? 0) > 0 && (
        <>
          <SectionHeader title={t("ui.herd.indTitle")} />
          <StatRow items={prod.data!.indicators.map((i) => ({ label: indicatorLabel(i), value: indicatorValueText(i) }))} />
        </>
      )}
      {rows.length === 0 ? (
        <DataList rows={[]} keyOf={() => ""} title={() => ""} empty={{ title: t("office.herd.stockEmpty"), hint: t("office.herd.stockEmptyHint") }} />
      ) : (
        <>
          <StatRow
            items={[
              { label: t("office.herd.stockHeads"), value: fmtNumber(head, 0) },
              { label: t("office.herd.stockUa"), value: fmtNumber(ua) },
              ...(farmUaHa !== null ? [{ label: t("office.herd.stockUaHa"), value: fmtNumber(farmUaHa, 2), tone: farmUaHa > maxUa ? ("danger" as const) : undefined }] : []),
            ]}
          />
          <Text style={[T.small, { marginTop: 12 }]}>{remote.data && !remote.data.maxUaIsDefault ? t("office.herd.stockLimit", { max: fmtNumber(maxUa, 2) }) : t("office.herd.stockLimitDefault", { max: fmtNumber(maxUa, 2) })}</Text>
          {over.length > 0 && (
            <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>
              {t("ui.herd.overLimit", { max: fmtNumber(maxUa, 2), plots: over.map((r) => r.plot.name).join(", ") })}
            </Text>
          )}
          <SectionHeader title={t("ui.common.plots")} />
          <DataList
            rows={rows}
            keyOf={(r) => r.plot.id}
            title={(r) => r.plot.name}
            subtitle={(r) => herdSubtitle(r, units.area)}
            right={(r) => {
              const v = uaPerHa(r.st!.counts, r.plot.areaHa);
              const rp = remotePlot.get(r.plot.id);
              return (
                <>
                  <Text style={[T.bodyMedium, { textAlign: "right", color: v !== null && v > maxUa ? C.peligro : C.tinta }]}>{v === null ? "—" : `${fmtNumber(v, 2)} UA/ha`}</Text>
                  <Text style={[T.small, { textAlign: "right" }]}>{t("office.herd.stockPlotLine", { head: fmtNumber(r.st!.total, 0), ua: fmtNumber(r.ua) })}</Text>
                  {rp && (
                    <Text style={[T.small, { textAlign: "right" }]}>
                      {loadLine(rp)}
                    </Text>
                  )}
                </>
              );
            }}
            empty={{ title: t("office.herd.stockEmpty") }}
          />
        </>
      )}
      <FormSheet visible={open} title={t("ui.herd.limitLabel")} onClose={() => setOpen(false)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={save.pending} error={formError ?? save.error}>
        <TextField label={t("ui.herd.limitLabel")} hint={t("ui.herd.limitHint")} value={limitText} onChangeText={setLimitText} kind="decimal" />
      </FormSheet>
      {remote.data && <Text style={[T.small, { marginTop: 12 }]}>{`${t("ui.herd.loadHint")}${remote.data.winter ? ` ${t("ui.herd.loadWinter")}` : ""}`}</Text>}
      <FormSheet visible={sysOpen} title={t("ui.herd.sysQuestion")} onClose={() => setSysOpen(false)} onSubmit={submitSys} submitLabel={t("ui.common.save")} pending={saveSys.pending} error={saveSys.error}>
        <SelectField<ProductionSystem> label={t("ui.herd.sysLabel")} value={sysPick || undefined} options={PRODUCTION_SYSTEMS.map((v) => ({ value: v, label: `${t(`ui.herd.sys_${v}` as MessageKey)} · ${t(`ui.herd.sysHint_${v}` as MessageKey)}` }))} onChange={(v) => setSysPick(v)} />
      </FormSheet>
    </FarmFrame>
  );
}
