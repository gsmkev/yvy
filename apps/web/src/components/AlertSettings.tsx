/** Umbrales de avisos de una estancia. Los edita el dueño o un administrador; el resto los ve. */
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { isFieldRole } from "@yvy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ALERT_SETTING_KEYS, ALERT_SETTING_LABELS, ALERT_SETTINGS_LIMITS, DEFAULT_ALERT_SETTINGS, type AlertSettings } from "@yvy/shared";
import { get, put } from "../lib/api";
import { t } from "../lib/i18n";
import { useFarms, useMe } from "../lib/queries";
import { Button, ErrorBox, Field, Form, Input, Select, Spinner } from "./ui";

type Settings = AlertSettings & { isDefault: boolean };
type Draft = Record<keyof AlertSettings, string>;


const toDraft = (v: AlertSettings): Draft => ({
  frostTminC: String(v.frostTminC),
  excessRainMm24h: String(v.excessRainMm24h),
  droughtDeficitPct: String(v.droughtDeficitPct),
});
const num = (v: string) => Number(v.replace(",", "."));

/** Estado de los umbrales de la estancia elegida: consulta, borrador editable y guardado. */
function useAlertSettings(farmId: string) {
  const farms = useFarms();
  const me = useMe();
  const id = farmId || farms.data?.[0]?.id || "";
  const qc = useQueryClient();
  const settings = useQuery({
    enabled: !!id && !!me.data && !isFieldRole(me.data.role),
    queryKey: ["alert-settings", id],
    queryFn: () => get<Settings>(`/org/farms/${id}/alert-settings`),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (settings.data) setDraft(toDraft(settings.data));
    setSaved(false);
  }, [settings.data]);

  const valid = draft
    ? ALERT_SETTING_KEYS.every(
        (k) =>
          draft[k].trim() !== "" &&
          num(draft[k]) >= ALERT_SETTINGS_LIMITS[k].min &&
          num(draft[k]) <= ALERT_SETTINGS_LIMITS[k].max,
      )
    : false;
  const save = useMutation({
    mutationFn: () =>
      put(`/org/farms/${id}/alert-settings`, {
        frostTminC: num(draft!.frostTminC),
        excessRainMm24h: num(draft!.excessRainMm24h),
        droughtDeficitPct: num(draft!.droughtDeficitPct),
      }),
    onSuccess: () => {
      setSaved(true);
      return qc.invalidateQueries({ queryKey: ["alert-settings", id] });
    },
  });
  return { farms, me, id, settings, draft, setDraft, saved, setSaved, valid, save };
}

/** Formulario de umbrales: campos, guardar y volver a los valores por defecto. */
function SettingsForm({ s, canEdit }: { s: ReturnType<typeof useAlertSettings>; canEdit: boolean }) {
  const { draft, setDraft, setSaved, valid, save, saved } = s;
  if (!draft) return null;
  return (
    <Form className="mt-4 flex flex-col gap-4" onSubmit={() => { if (valid) save.mutate(); }}>
      {ALERT_SETTING_KEYS.map((k) => (
        <Field key={k} label={t(ALERT_SETTING_LABELS[k][0])} hint={t(ALERT_SETTING_LABELS[k][1])}>
          <Input
            inputMode="decimal"
            className="w-32"
            value={draft[k]}
            disabled={!canEdit}
            onChange={(e) => {
              setSaved(false);
              setDraft({ ...draft, [k]: e.target.value });
            }}
          />
        </Field>
      ))}
      {!canEdit && <p className="text-sm text-tinta-2">{t("ui.alert.settingsOnlyOwner")}</p>}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" type="submit" disabled={!valid || save.isPending}>
            {t("ui.common.save")}
          </Button>
          <Button onClick={() => setDraft(toDraft(DEFAULT_ALERT_SETTINGS))}>{t("ui.alert.settingsDefaults")}</Button>
          {saved && <span className="text-sm text-tinta-2">{t("ui.alert.settingsSaved")}</span>}
        </div>
      )}
      {save.error ? <ErrorBox error={save.error} /> : null}
    </Form>
  );
}

/**
 * Sección plegable con los umbrales de avisos de una estancia.
 * @param open si está desplegada.
 */
export function AlertSettingsSection({ open, onToggle }: { open: boolean; /** Alterna el despliegue. */ onToggle: () => void }) {
  const [farmId, setFarmId] = useState("");
  const s = useAlertSettings(farmId);
  const { farms, me, id, settings } = s;
  const canEdit = me.data?.role === "owner" || me.data?.role === "admin";

  if ((me.data && isFieldRole(me.data.role)) || !farms.data?.length) return null;
  // En escritorio el bloque es una columna lateral siempre abierta; en el celular se despliega
  const hide = open ? "" : "max-lg:hidden";
  return (
    <section className="border-t border-linea pt-2 lg:border-t-0 lg:pt-0" aria-labelledby="alert-settings-title">
      <h2 id="alert-settings-title" className="text-section leading-6 font-semibold">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex h-12 w-full cursor-pointer items-center gap-1.5 text-left sm:h-10 lg:pointer-events-none"
        >
          <ChevronDown size={18} aria-hidden className={`transition-transform lg:hidden ${open ? "" : "-rotate-90"}`} />
          {t("ui.alert.settingsTitle")}
        </button>
      </h2>
      <div className={hide}>
        <p className="mt-1 text-sm text-tinta-2">{t("ui.alert.settingsIntro")}</p>
        {farms.data.length > 1 && (
          <div className="mt-4">
            <Field label={t("ui.common.farm")}>
              <Select
                value={id}
                onChange={(e) => setFarmId(e.target.value)}
                options={farms.data.map((f) => ({ value: f.id, label: f.name }))}
              />
            </Field>
          </div>
        )}
        {settings.isLoading && <Spinner />}
        {settings.error ? <ErrorBox error={settings.error} /> : null}
        <SettingsForm s={s} canEdit={canEdit} />
      </div>
    </section>
  );
}
