/** Presupuesto de campaña por lote, cultivo y actividad, frente a lo real (E-32). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ACTIVITIES, COST_CATEGORIES, CROPS } from "@yvy/shared";
import { del, get, post } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { useFarm, useFarms } from "../../lib/queries";
import { Button, Empty, ErrorBox, Field, FormActions, Input, Modal, Select, Spinner, Stat, toast } from "../ui";
import { useSeasonList } from "./CostsPanel";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions, RowMenu } from "./adminSlot";

interface Row {
  id: string;
  plotId: string | null;
  plotName: string | null;
  crop: string | null;
  activity: string | null;
  category: string;
  amountPyg: number;
  actualPyg: number;
  diffPyg: number;
  pct: number | null;
}
interface Compare {
  rows: Row[];
  totals: { costPlannedPyg: number; costActualPyg: number; incomePlannedPyg: number; incomeActualPyg: number };
}

export function BudgetPanel() {
  const seasons = useSeasonList();
  const [seasonId, setSeasonId] = useState("");
  const season = seasonId || seasons.data?.find((x) => x.active)?.id || seasons.data?.[0]?.id || "";
  const q = useQuery({ enabled: !!season, queryKey: ["erp", "budget", season], queryFn: () => get<Compare>(`/org/erp/budget/compare?seasonId=${season}`) });
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/budget-lines/${id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (seasons.isLoading) return <Spinner />;
  return (
    <div className="flex flex-col gap-4">
      {(seasons.data ?? []).length === 0 ? (
        <Empty>{t("ui.budgetNoSeason")}</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t("ui.costSeason")}>
              <Select value={season} onChange={(e) => setSeasonId(e.target.value)} options={(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
            </Field>
          </div>
          <HeaderActions>
            <Button variant="primary" onClick={() => setAdding(true)}>
              {t("ui.budgetNew")}
            </Button>
          </HeaderActions>
          {q.isLoading ? (
            <Spinner />
          ) : q.error ? (
            <ErrorBox error={q.error} />
          ) : q.data ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={t("ui.budgetCostPlanned")} value={fmtGs(q.data.totals.costPlannedPyg)} />
                <Stat label={t("ui.budgetCostActual")} value={fmtGs(q.data.totals.costActualPyg)} />
                <Stat label={t("ui.budgetIncomePlanned")} value={fmtGs(q.data.totals.incomePlannedPyg)} />
                <Stat label={t("ui.budgetIncomeActual")} value={fmtGs(q.data.totals.incomeActualPyg)} />
              </div>
              {q.data.rows.length === 0 ? (
                <Empty>{t("ui.erpEmpty")}</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <ExportableTable name="presupuesto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-linea text-left text-tinta-2">
                          <th className="py-2 pr-4 font-medium">{t("ui.budgetScope")}</th>
                          <th className="py-2 pr-4 font-medium">{t("ui.costCategory")}</th>
                          <th className="py-2 pr-4 text-right font-medium">{t("ui.budgetPlanned")}</th>
                          <th className="py-2 pr-4 text-right font-medium">{t("ui.budgetActual")}</th>
                          <th className="py-2 pr-4 text-right font-medium">{t("ui.budgetDiff")}</th>
                          <th className="py-2 pr-4 text-right font-medium">%</th>
                          <th className="sticky right-0 w-12 bg-lino">
                            <span className="sr-only">{t("ui.rowActionsHeader")}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.data.rows.map((r) => {
                          const income = r.category === "sale";
                          const bad = income ? r.diffPyg < 0 : r.diffPyg > 0;
                          return (
                            <tr key={r.id} className="border-b border-linea">
                              <td className="py-2.5 pr-4">
                                {r.plotId ? (r.plotName ?? t("ui.budgetPlot")) : r.crop ? tk(`fields.crop_${r.crop}`) : t("ui.budgetWhole")}
                                {r.activity ? <span className="text-tinta-2"> · {tk(`ui.activity_${r.activity}`)}</span> : null}
                              </td>
                              <td className="py-2.5 pr-4">{tk(`ui.costCategory_${r.category}`)}</td>
                              <td className="num py-2.5 pr-4 text-right">{fmtGs(r.amountPyg)}</td>
                              <td className="num py-2.5 pr-4 text-right">{fmtGs(r.actualPyg)}</td>
                              <td className={`num py-2.5 pr-4 text-right ${bad ? "text-peligro" : ""}`}>{fmtGs(r.diffPyg)}</td>
                              <td className="num py-2.5 pr-4 text-right">{r.pct === null ? "" : `${r.pct}`}</td>
                              <td className="sticky right-0 w-12 bg-lino py-1 text-right">
                                <RowMenu name={r.plotName ?? tk(`ui.costCategory_${r.category}`)} onDelete={() => remove.mutate(r.id)} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </ExportableTable>
                </div>
              )}
            </>
          ) : null}
        </>
      )}
      {adding && <LineModal seasonId={season} onClose={() => setAdding(false)} />}
    </div>
  );
}

function LineModal({ seasonId, onClose }: { seasonId: string; onClose: () => void }) {
  const farms = useFarms();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"season" | "plot" | "crop">("season");
  const [farmId, setFarmId] = useState("");
  const farm = useFarm(farmId, !!farmId);
  const [plotId, setPlotId] = useState("");
  const [crop, setCrop] = useState<string>(CROPS[0]);
  const [activity, setActivity] = useState("");
  const [category, setCategory] = useState("input");
  const [amount, setAmount] = useState("");
  const save = useMutation({
    mutationFn: () =>
      post("/org/erp/budget-lines", {
        seasonId,
        plotId: scope === "plot" ? plotId || null : null,
        crop: scope === "crop" ? crop : null,
        activity: activity || null,
        category,
        amountPyg: Number(amount),
      }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={t("ui.budgetNew")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.budgetScope")}>
          <Select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            options={[
              { value: "season", label: t("ui.budgetWhole") },
              { value: "plot", label: t("ui.budgetPlot") },
              { value: "crop", label: t("ui.budgetCrop") },
            ]}
          />
        </Field>
        {scope === "crop" && (
          <Field label={t("ui.budgetCrop")}>
            <Select value={crop} onChange={(e) => setCrop(e.target.value)} options={CROPS.map((c) => ({ value: c, label: tk(`fields.crop_${c}`) }))} />
          </Field>
        )}
        {scope === "plot" && (
          <>
            <Field label={t("ui.costFarm")}>
              <Select value={farmId} onChange={(e) => { setFarmId(e.target.value); setPlotId(""); }} options={[{ value: "", label: "—" }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
            </Field>
            <Field label={t("ui.costPlot")}>
              <Select value={plotId} onChange={(e) => setPlotId(e.target.value)} options={[{ value: "", label: "—" }, ...(farm.data?.plots ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
            </Field>
          </>
        )}
        <Field label={t("ui.costCategory")}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} options={COST_CATEGORIES.map((c) => ({ value: c, label: tk(`ui.costCategory_${c}`) }))} />
        </Field>
        <Field label={t("ui.costActivity")}>
          <Select value={activity} onChange={(e) => setActivity(e.target.value)} options={[{ value: "", label: t("ui.costAll") }, ...ACTIVITIES.map((a) => ({ value: a, label: tk(`ui.activity_${a}`) }))]} />
        </Field>
        <Field label={t("ui.budgetPlanned")}>
          <Input required type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <FormActions
          className="col-span-2"
          onCancel={onClose}
          disabled={save.isPending || (scope === "plot" && !plotId)}
        />
      </form>
    </Modal>
  );
}
