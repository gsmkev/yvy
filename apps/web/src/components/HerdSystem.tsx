/** Sistema productivo de la estancia (ADR 0005): la pregunta de la primera vez, el sistema elegido y sus indicadores. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PASTURE_CLASSES,
  PRODUCTION_SYSTEMS,
  RECOMMENDED_LOAD_LIMITS,
  RECOMMENDED_UA_PER_HA,
  type PastureClass,
  indicatorLabel,
  indicatorValueText,
  type FarmStockResponse,
  type ProductionResponse,
  type ProductionSystem,
} from "@yvy/shared";
import { get, put } from "../lib/api";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";
import { Button, Card, ErrorBox, Field, Form, Input, Select, Stat, toast } from "./ui";

/** Sistema elegido (de la hacienda calculada, que ya lo trae). */
export function useSystem(farmId: string) {
  return useQuery({
    queryKey: ["stock", farmId],
    queryFn: () => get<FarmStockResponse>(`/org/farms/${farmId}/stock`),
    select: (d) => d.system,
  });
}

function useSaveSystem(farmId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (system: ProductionSystem) => put(`/org/farms/${farmId}/livestock-settings`, { system }),
    onSuccess: () => {
      toast(t("ui.herd.sysSaved"));
      return Promise.all([qc.invalidateQueries({ queryKey: ["stock", farmId] }), qc.invalidateQueries({ queryKey: ["production", farmId] })]);
    },
  });
}

function SystemChoices({ farmId, current, onDone }: { farmId: string; current: ProductionSystem | null; onDone?: () => void }) {
  const save = useSaveSystem(farmId);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTION_SYSTEMS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={save.isPending}
            aria-pressed={current === s}
            onClick={() => save.mutate(s, { onSuccess: onDone })}
            className={`cursor-pointer rounded-md border p-3 text-left transition-colors hover:border-accion disabled:opacity-50 ${current === s ? "border-accion bg-accion/5" : "border-linea bg-papel"}`}
          >
            <span className="block text-sm font-medium">{tk(`ui.herd.sys_${s}`)}</span>
            <span className="block text-xs text-tinta-2">{tk(`ui.herd.sysHint_${s}`)}</span>
          </button>
        ))}
      </div>
      {save.error ? <ErrorBox error={save.error} /> : null}
    </div>
  );
}

/** Pregunta la primera vez (solo dueño y administrador) o muestra el sistema con "Cambiar". */
export function SystemBar({ farmId, system }: { farmId: string; system: ProductionSystem | null }) {
  const me = useMe();
  const canEdit = me.data?.role === "owner" || me.data?.role === "admin";
  const [open, setOpen] = useState(false);
  if (!canEdit && !system) return null;
  if (!system || open)
    return (
      <Card className="mt-4">
        <p className="text-sm font-medium">{t("ui.herd.sysQuestion")}</p>
        <p className="mb-3 text-xs text-tinta-2">{t("ui.herd.sysQuestionHint")}</p>
        <SystemChoices farmId={farmId} current={system} onDone={() => setOpen(false)} />
      </Card>
    );
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-tinta-2">{t("ui.herd.sysLabel")}</span>
      <span className="font-medium">{tk(`ui.herd.sys_${system}`)}</span>
      {canEdit && (
        <Button size="sm" variant="quiet" onClick={() => setOpen(true)}>
          {t("ui.herd.sysChange")}
        </Button>
      )}
    </div>
  );
}

/** Indicadores del sistema con lo que ya se registra; si ninguno tiene datos, no se muestra nada. */
export function SystemIndicators({ farmId, system }: { farmId: string; system: ProductionSystem | null }) {
  const q = useQuery({
    queryKey: ["production", farmId],
    queryFn: () => get<ProductionResponse>(`/org/farms/${farmId}/production`),
    enabled: !!system,
  });
  if (system === "tambo") return <p className="mt-3 text-sm text-tinta-2">{t("ui.herd.sysTamboNote")}</p>;
  const list = q.data?.indicators ?? [];
  if (!list.length) return null;
  return (
    <div className="mt-4">
      <p className="eyebrow mb-2">{t("ui.herd.indTitle")}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((i) => (
          <Stat key={i.id} label={indicatorLabel(i)} value={indicatorValueText(i)} />
        ))}
      </div>
    </div>
  );
}

const dec = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const num = (v: string) => Number(v.replace(",", "."));

/** Cargas recomendadas editables (UA/ha en época normal) y tipo de pastura por defecto. Solo dueño y administrador. */
export function LoadEditor({ farmId, d }: { farmId: string; d: FarmStockResponse }) {
  const qc = useQueryClient();
  const initial = () =>
    Object.fromEntries(PASTURE_CLASSES.map((c) => [c, dec.format(d.pastureLoads[c] ?? RECOMMENDED_UA_PER_HA[c])])) as Record<PastureClass, string>;
  const [vals, setVals] = useState(initial);
  const [def, setDef] = useState<PastureClass>(d.pastureDefault);
  const ok = PASTURE_CLASSES.every((c) => num(vals[c]) >= RECOMMENDED_LOAD_LIMITS.min && num(vals[c]) <= RECOMMENDED_LOAD_LIMITS.max);
  const save = useMutation({
    mutationFn: () =>
      put(`/org/farms/${farmId}/livestock-settings`, {
        pastureDefault: def,
        pastureLoads: Object.fromEntries(PASTURE_CLASSES.map((c) => [c, num(vals[c])])),
      }),
    onSuccess: () => {
      toast(t("ui.herd.loadSaved"));
      return qc.invalidateQueries({ queryKey: ["stock", farmId] });
    },
  });
  return (
    <Form className="flex max-w-xl flex-col gap-3 border-t border-linea pt-4" onSubmit={() => { if (ok) save.mutate(); }}>
      <div>
        <p className="text-sm font-medium">{t("ui.herd.loadEdit")}</p>
        <p className="text-xs text-tinta-2">{t("ui.herd.loadEditHint")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PASTURE_CLASSES.map((c) => (
          <Field key={c} label={tk(`ui.herd.loadClass_${c}`)}>
            <Input inputMode="decimal" value={vals[c]} onChange={(e) => setVals({ ...vals, [c]: e.target.value })} />
          </Field>
        ))}
      </div>
      <Field label={t("ui.herd.loadDefault")}>
        <Select
          value={def}
          onChange={(e) => setDef(e.target.value as PastureClass)}
          options={PASTURE_CLASSES.map((c) => ({ value: c, label: tk(`ui.herd.loadClass_${c}`) }))}
        />
      </Field>
      <div>
        <Button variant="primary" type="submit" disabled={!ok || save.isPending}>
          {t("ui.common.save")}
        </Button>
      </div>
      {save.error ? <ErrorBox error={save.error} /> : null}
    </Form>
  );
}
