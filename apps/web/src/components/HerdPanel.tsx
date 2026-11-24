/** Pestaña Hacienda: hacienda calculada por potrero, carga animal y límite configurable. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HERD_CATEGORIES, MAX_UA_PER_HA_LIMITS, SYSTEM_SECTION_ORDER, UA_EQUIVALENTS, type FarmStockResponse } from "@yvy/shared";
import { get, put } from "../lib/api";
import { fmtDay, fmtHa } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";
import { HeatStressCard } from "./HeatStress";
import { ForagePanel } from "./ForagePanel";
import { RotationPanel } from "./RotationPanel";
import { AnimalsPanel } from "./AnimalsPanel";
import { BreedingPlanPanel } from "./BreedingPlanPanel";
import { ReproPanel } from "./ReproPanel";
import { SupplementPanel } from "./SupplementPanel";
import { TheftPanel } from "./TheftPanel";
import { WeighingsPanel } from "./WeighingsPanel";
import { LoadEditor, SystemBar, SystemIndicators, useSystem } from "./HerdSystem";
import { Button, Empty, ErrorBox, Field, Form, Input, Spinner, toast } from "./ui";
import { ExportableTable } from "./ExportableTable";

const dec = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const num = (v: string) => Number(v.replace(",", "."));

function StockSection({ farmId }: { farmId: string }) {
  const me = useMe();
  const canEditLimit = me.data?.role === "owner" || me.data?.role === "admin";
  const qc = useQueryClient();
  const stock = useQuery({
    queryKey: ["stock", farmId],
    queryFn: () => get<FarmStockResponse>(`/org/farms/${farmId}/stock`),
  });
  const [limit, setLimit] = useState("");
  useEffect(() => {
    if (stock.data) setLimit(String(stock.data.maxUaPerHa).replace(".", ","));
  }, [stock.data?.maxUaPerHa]);
  const limitOk =
    limit.trim() !== "" && num(limit) >= MAX_UA_PER_HA_LIMITS.min && num(limit) <= MAX_UA_PER_HA_LIMITS.max;
  const save = useMutation({
    mutationFn: () => put(`/org/farms/${farmId}/livestock-settings`, { maxUaPerHa: num(limit) }),
    onSuccess: () => {
      toast(t("ui.toast.limitSaved"));
      return qc.invalidateQueries({ queryKey: ["stock", farmId] });
    },
  });

  if (stock.isLoading) return <Spinner rows={5} h={56} />;
  if (stock.error) return <ErrorBox error={stock.error} />;
  const d = stock.data;
  if (!d) return null;
  if (!d.plots.length) return <Empty title={t("ui.herd.noPaddocks")}>{t("ui.herd.noPaddocksHint")}</Empty>;
  const over = d.plots.filter((p) => p.overLimit);
  const maxText = dec.format(d.maxUaPerHa);

  return (
    <div className="mt-4 flex flex-col gap-6">
      <div>
        <p className="num text-sm">
          {t("ui.herd.farmLine", {
            head: int.format(d.farm.total),
            ua: dec.format(d.farm.ua),
            area: fmtHa(d.farm.areaHa),
          })}
          {d.farm.uaPerHa !== null && " · " + t("ui.herd.uaPerHa", { v: dec.format(d.farm.uaPerHa) })}
        </p>
        {(d.farm.overLimit || over.length > 0) && (
          <p role="alert" className="mt-2 text-sm font-medium text-peligro">
            {t("ui.herd.overLimit", { max: maxText, plots: over.map((p) => p.name).join(", ") || t("ui.herd.wholeFarm") })}
          </p>
        )}
        {d.truncated && <p className="mt-2 text-sm text-tinta-2">{t("ui.herd.truncated")}</p>}
      </div>

      <div className="overflow-x-auto">
        <ExportableTable name="hacienda">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-2">
                <th className="pb-2 font-medium">{t("ui.common.plot")}</th>
                {HERD_CATEGORIES.map((c) => (
                  <th key={c} className="pb-2 text-right font-medium">
                    {tk(`fields.herd.${c}`)}
                  </th>
                ))}
                <th className="pb-2 text-right font-medium">{t("ui.herd.total")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.herd.uaPerHaHead")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.herd.loadRecommended")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.herd.loadDiff")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.herd.lastCount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea border-t border-linea">
              {d.plots.map((p) => (
                <tr key={p.plotId}>
                  <td className="py-2.5 font-medium">{p.name}</td>
                  {HERD_CATEGORIES.map((c) => (
                    <td key={c} className="num py-2.5 text-right">
                      {p.counts[c] || "—"}
                    </td>
                  ))}
                  <td className="num py-2.5 text-right font-medium">{int.format(p.total)}</td>
                  <td className={`num py-2.5 text-right ${p.overLimit ? "font-medium text-peligro" : ""}`}>
                    {p.uaPerHa === null ? "—" : dec.format(p.uaPerHa)}
                  </td>
                  <td className="num py-2.5 text-right" title={tk(`ui.herd.loadClass_${p.pastureClass}`)}>
                    {dec.format(p.recommendedUaPerHa)}
                  </td>
                  <td className="num py-2.5 text-right text-tinta-2">
                    {p.total === 0
                      ? "—"
                      : Math.abs(p.diffUa) < 0.5
                        ? t("ui.herd.loadOk")
                        : p.diffUa > 0
                          ? t("ui.herd.loadSurplus", { n: dec.format(p.diffUa) })
                          : t("ui.herd.loadShortfall", { n: dec.format(-p.diffUa) })}
                  </td>
                  <td className="num py-2.5 text-right text-tinta-2">
                    {p.lastCountAt ? fmtDay(p.lastCountAt) : t("ui.herd.neverCounted")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ExportableTable>
      </div>

      <Form className="flex max-w-xl flex-col gap-3 border-t border-linea pt-4" onSubmit={() => { if (limitOk) save.mutate(); }}>
        <Field label={t("ui.herd.limitLabel")} hint={t("ui.herd.limitHint")}>
          <Input
            inputMode="decimal"
            className="w-32"
            value={limit}
            disabled={!canEditLimit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
        {d.maxUaIsDefault && <p className="text-sm text-tinta-2">{t("ui.herd.limitIsDefault")}</p>}
        {canEditLimit ? (
          <div>
            <Button variant="primary" type="submit" disabled={!limitOk || save.isPending}>
              {t("ui.common.save")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-tinta-2">{t("ui.alert.settingsOnlyOwner")}</p>
        )}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </Form>

      <p className="-mt-3 text-xs text-tinta-2">
        {t("ui.herd.loadHint")}
        {d.winter && ` ${t("ui.herd.loadWinter")}`}
      </p>
      {canEditLimit && <LoadEditor key={`${d.pastureDefault}|${JSON.stringify(d.pastureLoads)}`} farmId={farmId} d={d} />}

      <HeatStressCard farmId={farmId} />

      <p className="text-xs text-tinta-2">
        {t("ui.herd.equivalents", {
          list: HERD_CATEGORIES.map((c) => `${tk(`fields.herd.${c}`).toLowerCase()} ${dec.format(UA_EQUIVALENTS[c])}`).join(", "),
        })}
      </p>
    </div>
  );
}

type Section = "stock" | "plan" | "rotation" | "forage" | "animals" | "repro" | "weights" | "supplements" | "theft";

/**
 * Secciones como pastillas (mismo patrón que admin-erp): en el panel angosto se desplazan de costado
 * en celular y se envuelven en escritorio, así que todas quedan a la vista.
 */
function SectionPills({ items, value, onChange }: { items: { id: Section; label: string }[]; value: Section; onChange: (id: Section) => void }) {
  // La sección activa siempre queda a la vista
  useEffect(() => {
    document.getElementById(`herd-pill-${value}`)?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [value]);
  return (
    <div
      role="group"
      aria-label={t("ui.herd.sections")}
      className="-mx-4 flex min-w-0 gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {items.map((it) => (
        <Button
          key={it.id}
          id={`herd-pill-${it.id}`}
          size="sm"
          variant="quiet"
          aria-current={value === it.id ? "page" : undefined}
          onClick={() => onChange(it.id)}
          className={`shrink-0 whitespace-nowrap ${value === it.id ? "!bg-surco/[0.07] !text-surco" : ""}`}
        >
          {it.label}
        </Button>
      ))}
    </div>
  );
}

/** Pestaña Hacienda: hacienda calculada y, abajo, cada módulo de ganadería en su sección. */
export function HerdPanel({ farmId }: { farmId: string }) {
  const [section, setSection] = useState<Section>("stock");
  const system = useSystem(farmId).data ?? null;
  const first: readonly string[] = system ? SYSTEM_SECTION_ORDER[system] : [];
  const rank = (id: string) => (id === "stock" ? -1 : first.includes(id) ? first.indexOf(id) : first.length);
  return (
    <div className="mt-4 flex flex-col gap-2">
      <SystemBar farmId={farmId} system={system} />
      <SystemIndicators farmId={farmId} system={system} />
      <SectionPills
        value={section}
        onChange={setSection}
        items={([
          { id: "stock", label: t("ui.herd.sectionStock") },
          { id: "rotation", label: t("ui.herd.sectionRotation") },
          { id: "forage", label: t("ui.herd.sectionForage") },
          { id: "animals", label: t("ui.herd.sectionAnimals") },
          { id: "plan", label: t("ui.repro.planSection") },
          { id: "repro", label: t("ui.herd.sectionRepro") },
          { id: "weights", label: t("ui.herd.sectionWeights") },
          { id: "supplements", label: t("ui.herd.sectionSupp") },
          { id: "theft", label: t("ui.herd.sectionTheft") },
        ] as { id: Section; label: string }[]).sort((a, b) => rank(a.id) - rank(b.id))}
      />
      {section === "stock" && <StockSection farmId={farmId} />}
      {section === "rotation" && <RotationPanel farmId={farmId} />}
      {section === "forage" && <ForagePanel farmId={farmId} />}
      {section === "animals" && <AnimalsPanel farmId={farmId} />}
      {section === "plan" && <BreedingPlanPanel farmId={farmId} />}
      {section === "repro" && <ReproPanel farmId={farmId} />}
      {section === "weights" && <WeighingsPanel farmId={farmId} />}
      {section === "supplements" && <SupplementPanel farmId={farmId} />}
      {section === "theft" && <TheftPanel farmId={farmId} />}
    </div>
  );
}
