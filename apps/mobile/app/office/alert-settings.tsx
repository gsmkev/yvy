/**
 * Umbrales de avisos por estancia (función 110): helada, exceso de lluvia y sequía. Los edita el dueño o un
 * administrador; el resto los ve. API: GET y PUT /org/farms/:id/alert-settings (apps/api/src/routes/org.ts).
 */
import { useEffect, useState } from "react";
import { ALERT_SETTING_KEYS, ALERT_SETTING_LABELS, ALERT_SETTINGS_LIMITS, DEFAULT_ALERT_SETTINGS, isFieldRole, t, type AlertSettings } from "@yvy/shared";
import { getSession } from "../../src/lib/session";
import { showToast } from "../../src/lib/toast";
import { FarmChips, useFarmPick } from "../../src/office/farmPick";
import { parseDecimal } from "../../src/office/format";
import { NoSignalNote, useNoSignalReason } from "../../src/office/erpCommon";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { TextField } from "../../src/office/ui";
import { useOnline } from "../../src/office/useOnline";
import { useOnlineMutation } from "../../src/office/useOnlineMutation";
import { Button, EmptyState, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

type Settings = AlertSettings & { isDefault: boolean };
type Draft = Record<keyof AlertSettings, string>;

const toDraft = (v: AlertSettings): Draft => ({ frostTminC: String(v.frostTminC).replace(".", ","), excessRainMm24h: String(v.excessRainMm24h).replace(".", ","), droughtDeficitPct: String(v.droughtDeficitPct).replace(".", ",") });

export default function AlertSettingsScreen() {
  const role = getSession()?.organization.role ?? "";
  const canEdit = role === "owner" || role === "admin";
  const { farms, farm, setFarmId } = useFarmPick();
  const q = useOnline<Settings>(farm && !isFieldRole(role) ? `/org/farms/${farm.id}/alert-settings` : null, { cache: false });
  const [draft, setDraft] = useState<Draft | null>(null);
  const noSignal = useNoSignalReason();
  const save = useOnlineMutation<AlertSettings, unknown>("PUT", `/org/farms/${farm?.id}/alert-settings`, { invalidate: ["/org/farms"] });
  useEffect(() => {
    if (q.data) setDraft(toDraft(q.data));
    save.reset();
  }, [q.data]);

  if (isFieldRole(role)) return <OfficeScreen title={t("ui.alertSettingsTitle")}><EmptyState title={t("office.admNoAccess")} /></OfficeScreen>;

  const values = draft ? ALERT_SETTING_KEYS.map((k) => parseDecimal(draft[k])) : [];
  const errorOf = (k: (typeof ALERT_SETTING_KEYS)[number]): string | undefined => {
    if (!draft) return undefined;
    const n = parseDecimal(draft[k]);
    const { min, max } = ALERT_SETTINGS_LIMITS[k];
    return n === null || n < min || n > max ? t("office.alertSettingsRange", { min, max }) : undefined;
  };
  const valid = !!draft && ALERT_SETTING_KEYS.every((k) => !errorOf(k));
  const submit = async () => {
    if (!draft || !valid) return;
    const r = await save.mutate({ frostTminC: values[0]!, excessRainMm24h: values[1]!, droughtDeficitPct: values[2]! });
    if (r.ok) {
      showToast(t("ui.alertSettingsSaved"));
      void q.refresh();
    }
  };

  return (
    <OfficeScreen
      title={t("ui.alertSettingsTitle")}
      subtitle={t("ui.alertSettingsIntro")}
      query={q}
      action={canEdit && draft ? { label: t("ui.save"), onPress: () => void submit(), disabled: !valid || !!noSignal, loading: save.pending } : undefined}
      footer={canEdit ? <NoSignalNote /> : undefined}
    >
      <FarmChips farms={farms} value={farm?.id} onChange={setFarmId} />
      {farms.length === 0 ? <EmptyState title={t("office.hubNoFarms")} hint={t("office.hubNoFarmsHint")} /> : null}
      <OnlineState query={q} skeletonRows={3} empty={{ title: t("office.hubNoFarms") }} isEmpty={() => false}>
        {() =>
          draft ? (
            <>
              {ALERT_SETTING_KEYS.map((k) => (
                <TextField key={k} label={t(ALERT_SETTING_LABELS[k][0])} hint={t(ALERT_SETTING_LABELS[k][1])} value={draft[k]} onChangeText={(v) => setDraft({ ...draft, [k]: v })} kind="decimal" editable={canEdit} error={canEdit ? errorOf(k) : undefined} />
              ))}
              {!canEdit ? <Text style={[T.small, { marginTop: 16 }]}>{t("ui.alertSettingsOnlyOwner")}</Text> : null}
              {canEdit ? <Button kind="secondary" title={t("ui.alertSettingsDefaults")} onPress={() => setDraft(toDraft(DEFAULT_ALERT_SETTINGS))} style={{ marginTop: 20 }} /> : null}
              {save.error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { marginTop: 16, color: C.peligro }]}>{save.error}</Text> : null}
            </>
          ) : null
        }
      </OnlineState>
    </OfficeScreen>
  );
}
