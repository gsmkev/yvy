/** Existencias por potrero, UA y límite de carga (función 67). Se calcula con los conteos y movimientos del celular; el límite viene de la estancia. */
import { useState } from "react";
import { Settings2 } from "lucide-react-native";
import { DEFAULT_MAX_UA_PER_HA, HERD_CATEGORIES, MAX_UA_PER_HA_LIMITS, PRODUCTION_SYSTEMS, indicatorLabel, indicatorValueText, type ProductionResponse, type ProductionSystem, uaOf, uaPerHa, t, type FarmStockResponse, type MessageKey, areaLabel, haToArea } from "@yvy/shared";
import { getDb } from "../../../src/lib/db";
import { showToast } from "../../../src/lib/toast";
import { getSession } from "../../../src/lib/session";
import { useUnits } from "../../../src/lib/units";
import { useLocal } from "../../../src/lib/useLocal";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtDate, fmtNumber, parseDecimal } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { DataList, FormSheet, SelectField, StatRow, TextField } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

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

  const model = useLocal(() => {
    if (!farm) return null;
    const db = getDb();
    const rows = db
      .plots(farm.id)
      .filter((p) => p.kind === "pasture")
      .map((p) => {
        const st = db.herdStock(p.id);
        return { plot: p, st, ua: st ? uaOf(st.counts) : 0 };
      })
      .filter((r) => r.st && r.st.total > 0)
      .sort((a, b) => b.ua - a.ua);
    return rows;
  }, [farm?.id]);

  const maxUa = remote.data?.maxUaPerHa ?? DEFAULT_MAX_UA_PER_HA;
  const rows = model ?? [];
  const head = rows.reduce((n, r) => n + (r.st?.total ?? 0), 0);
  const ua = rows.reduce((n, r) => n + r.ua, 0);
  const area = rows.reduce((n, r) => n + r.plot.areaHa, 0);
  const farmUaHa = area > 0 ? ua / area : null;
  const over = rows.filter((r) => uaPerHa(r.st!.counts, r.plot.areaHa) !== null && uaPerHa(r.st!.counts, r.plot.areaHa)! > maxUa);

  const system = remote.data?.system ?? null;
  const remotePlot = new Map((remote.data?.plots ?? []).map((p) => [p.plotId, p]));
  const submitSys = async () => {
    if (!sysPick) return;
    const r = await saveSys.mutate({ system: sysPick });
    if (r.ok) {
      setSysOpen(false);
      showToast(t("ui.herdSysSaved"));
      void remote.refresh();
    }
  };
  const submit = async () => {
    const v = parseDecimal(limitText);
    if (v === null || v < MAX_UA_PER_HA_LIMITS.min || v > MAX_UA_PER_HA_LIMITS.max) return setFormError(t("office.herdStockLimitBad", { min: fmtNumber(MAX_UA_PER_HA_LIMITS.min), max: MAX_UA_PER_HA_LIMITS.max }));
    setFormError(null);
    const r = await save.mutate({ maxUaPerHa: v });
    if (r.ok) {
      setOpen(false);
      showToast(t("office.herdStockLimitSaved"));
      void remote.refresh();
    }
  };

  return (
    <FarmFrame
      title={t("office.herdStockTitle")}
      farms={farms}
      farm={farm}
      setFarmId={setFarmId}
      query={remote}
      action={canEditLimit && farm ? { label: t("office.herdStockLimitEdit"), icon: Settings2, onPress: () => { save.reset(); setFormError(null); setLimitText(fmtNumber(maxUa, 2)); setOpen(true); } } : undefined}
    >
      {canEditLimit && farm && remote.data && (
        <>
          {!system && <Text style={T.bodyMedium}>{t("ui.herdSysQuestion")}</Text>}
          {!system && <Text style={[T.small, { marginBottom: 8 }]}>{t("ui.herdSysQuestionHint")}</Text>}
          <Text
            accessibilityRole="button"
            onPress={() => { saveSys.reset(); setSysPick(system ?? ""); setSysOpen(true); }}
            style={[T.bodyMedium, { color: C.accion, marginBottom: 8 }]}
          >
            {system ? `${t("ui.herdSysLabel")}: ${t(`ui.herdSys_${system}` as MessageKey)} · ${t("ui.herdSysChange")}` : t("ui.herdSysChange")}
          </Text>
        </>
      )}
      {system === "tambo" && <Text style={T.small}>{t("ui.herdSysTamboNote")}</Text>}
      {(prod.data?.indicators.length ?? 0) > 0 && (
        <>
          <SectionHeader title={t("ui.herdIndTitle")} />
          <StatRow items={prod.data!.indicators.map((i) => ({ label: indicatorLabel(i), value: indicatorValueText(i) }))} />
        </>
      )}
      {rows.length === 0 ? (
        <DataList rows={[]} keyOf={() => ""} title={() => ""} empty={{ title: t("office.herdStockEmpty"), hint: t("office.herdStockEmptyHint") }} />
      ) : (
        <>
          <StatRow
            items={[
              { label: t("office.herdStockHeads"), value: fmtNumber(head, 0) },
              { label: t("office.herdStockUa"), value: fmtNumber(ua) },
              ...(farmUaHa !== null ? [{ label: t("office.herdStockUaHa"), value: fmtNumber(farmUaHa, 2), tone: farmUaHa > maxUa ? ("danger" as const) : undefined }] : []),
            ]}
          />
          <Text style={[T.small, { marginTop: 12 }]}>{remote.data && !remote.data.maxUaIsDefault ? t("office.herdStockLimit", { max: fmtNumber(maxUa, 2) }) : t("office.herdStockLimitDefault", { max: fmtNumber(maxUa, 2) })}</Text>
          {over.length > 0 && (
            <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>
              {t("ui.herdOverLimit", { max: fmtNumber(maxUa, 2), plots: over.map((r) => r.plot.name).join(", ") })}
            </Text>
          )}
          <SectionHeader title={t("ui.plots")} />
          <DataList
            rows={rows}
            keyOf={(r) => r.plot.id}
            title={(r) => r.plot.name}
            subtitle={(r) =>
              [
                HERD_CATEGORIES.filter((c) => r.st!.counts[c] > 0).map((c) => t(`fields.herdCount_${c}` as MessageKey, { n: r.st!.counts[c] })).join(", "),
                `${fmtNumber(haToArea(r.plot.areaHa, units.area))} ${areaLabel(units.area)}`,
                r.st!.lastCountAt ? t("office.farmsLastRecord", { date: fmtDate(r.st!.lastCountAt) }) : t("ui.herdNeverCounted"),
              ].join(" · ")
            }
            right={(r) => {
              const v = uaPerHa(r.st!.counts, r.plot.areaHa);
              const rp = remotePlot.get(r.plot.id);
              return (
                <>
                  <Text style={[T.bodyMedium, { textAlign: "right", color: v !== null && v > maxUa ? C.peligro : C.tinta }]}>{v === null ? "—" : `${fmtNumber(v, 2)} UA/ha`}</Text>
                  <Text style={[T.small, { textAlign: "right" }]}>{t("office.herdStockPlotLine", { head: fmtNumber(r.st!.total, 0), ua: fmtNumber(r.ua) })}</Text>
                  {rp && (
                    <Text style={[T.small, { textAlign: "right" }]}>
                      {`${t("ui.herdLoadRecommended")} ${fmtNumber(rp.recommendedUaPerHa, 2)} · ${Math.abs(rp.diffUa) < 0.5 ? t("ui.herdLoadOk") : rp.diffUa > 0 ? t("ui.herdLoadSurplus", { n: fmtNumber(rp.diffUa, 1) }) : t("ui.herdLoadShortfall", { n: fmtNumber(-rp.diffUa, 1) })}`}
                    </Text>
                  )}
                </>
              );
            }}
            empty={{ title: t("office.herdStockEmpty") }}
          />
        </>
      )}
      <FormSheet visible={open} title={t("ui.herdLimitLabel")} onClose={() => setOpen(false)} onSubmit={submit} submitLabel={t("ui.save")} pending={save.pending} error={formError ?? save.error}>
        <TextField label={t("ui.herdLimitLabel")} hint={t("ui.herdLimitHint")} value={limitText} onChangeText={setLimitText} kind="decimal" />
      </FormSheet>
      {remote.data && <Text style={[T.small, { marginTop: 12 }]}>{`${t("ui.herdLoadHint")}${remote.data.winter ? ` ${t("ui.herdLoadWinter")}` : ""}`}</Text>}
      <FormSheet visible={sysOpen} title={t("ui.herdSysQuestion")} onClose={() => setSysOpen(false)} onSubmit={submitSys} submitLabel={t("ui.save")} pending={saveSys.pending} error={saveSys.error}>
        <SelectField<ProductionSystem> label={t("ui.herdSysLabel")} value={sysPick || undefined} options={PRODUCTION_SYSTEMS.map((v) => ({ value: v, label: `${t(`ui.herdSys_${v}` as MessageKey)} · ${t(`ui.herdSysHint_${v}` as MessageKey)}` }))} onChange={(v) => setSysPick(v)} />
      </FormSheet>
    </FarmFrame>
  );
}
