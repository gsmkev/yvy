/** Presupuesto de campaña por lote, cultivo y actividad, frente a lo real. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ACTIVITIES, COST_CATEGORIES, CROPS } from "@yvy/shared";
import { del, get, post } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { useFarm, useFarms } from "../../lib/queries";
import { useNavigate } from "@tanstack/react-router";
import { Button, type Column, DataTable, EmptyState, ErrorBox, Field, FilterBar, Form, FormFooter, Input, Modal, Select, Spinner, Stat, toast, StatRow } from "../ui";
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

/** Presupuesto de campaña frente a lo real. */
export function BudgetPanel() {
  const seasons = useSeasonList();
  const [seasonId, setSeasonId] = useState("");
  const season = seasonId || seasons.data?.find((x) => x.active)?.id || seasons.data?.[0]?.id || "";
  const q = useQuery({ enabled: !!season, queryKey: ["erp", "budget", season], queryFn: () => get<Compare>(`/org/erp/budget/compare?seasonId=${season}`) });
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/budget-lines/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (seasons.isLoading) return <Spinner />;
  if ((seasons.data ?? []).length === 0)
    return (
      <EmptyState
        title={t("ui.budget.noSeason")}
        action={
          <Button variant="primary" onClick={() => navigate({ to: "/" })}>
            {t("ui.budget.goFarms")}
          </Button>
        }
      >
        {t("ui.budget.noSeasonHint")}
      </EmptyState>
    );
  const rows = q.data?.rows ?? [];
  const cols: Column<Row>[] = [
    {
      id: "scope",
      header: t("ui.budget.scope"),
      cell: (r) => (
        <>
          {r.plotId ? (r.plotName ?? t("ui.budget.plot")) : r.crop ? tk(`fields.crop.${r.crop}`) : t("ui.budget.whole")}
          {r.activity ? <span className="font-normal text-tinta-2"> · {tk(`ui.activity.${r.activity}`)}</span> : null}
        </>
      ),
    },
    { id: "category", header: t("ui.cost.category"), hideBelow: "sm", cell: (r) => tk(`ui.cost.category_${r.category}`) },
    { id: "planned", header: t("ui.budget.planned"), align: "right", cell: (r) => fmtGs(r.amountPyg) },
    { id: "actual", header: t("ui.budget.actual"), align: "right", hideBelow: "sm", cell: (r) => fmtGs(r.actualPyg) },
    {
      id: "diff",
      header: t("ui.budget.diff"),
      align: "right",
      hideBelow: "md",
      cell: (r) => {
        const bad = r.category === "sale" ? r.diffPyg < 0 : r.diffPyg > 0;
        return <span className={bad ? "text-peligro" : ""}>{fmtGs(r.diffPyg)}</span>;
      },
    },
    { id: "pct", header: "%", align: "right", hideBelow: "md", cell: (r) => (r.pct === null ? "" : `${r.pct}`) },
    { id: "_a", header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>, align: "right", width: "3rem", cell: (r) => <RowMenu name={r.plotName ?? tk(`ui.cost.category_${r.category}`)} onDelete={() => remove.mutate(r.id)} /> },
  ];
  const newBtn = (
    <Button variant="primary" onClick={() => setAdding(true)}>
      {t("ui.budget.new")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && <HeaderActions>{newBtn}</HeaderActions>}
      <FilterBar sheet={false}>
        <Field label={t("ui.cost.season")}>
          <Select value={season} onChange={(e) => setSeasonId(e.target.value)} options={(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
        </Field>
      </FilterBar>
      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : q.data ? (
        rows.length === 0 ? (
          <EmptyState title={t("ui.budget.emptyTitle")} action={newBtn}>
            {t("ui.budget.emptyHint")}
          </EmptyState>
        ) : (
          <>
            <StatRow>
              <Stat label={t("ui.budget.costPlanned")} value={fmtGs(q.data.totals.costPlannedPyg)} />
              <Stat label={t("ui.budget.costActual")} value={fmtGs(q.data.totals.costActualPyg)} />
              <Stat label={t("ui.budget.incomePlanned")} value={fmtGs(q.data.totals.incomePlannedPyg)} />
              <Stat label={t("ui.budget.incomeActual")} value={fmtGs(q.data.totals.incomeActualPyg)} />
            </StatRow>
            <ExportableTable name="presupuesto">
              <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} caption={t("ui.admin.section_budget")} />
            </ExportableTable>
          </>
        )
      ) : null}
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
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={t("ui.budget.new")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.budget.scope")}>
          <Select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            options={[
              { value: "season", label: t("ui.budget.whole") },
              { value: "plot", label: t("ui.budget.plot") },
              { value: "crop", label: t("ui.budget.crop") },
            ]}
          />
        </Field>
        {scope === "crop" && (
          <Field label={t("ui.budget.crop")}>
            <Select value={crop} onChange={(e) => setCrop(e.target.value)} options={CROPS.map((c) => ({ value: c, label: tk(`fields.crop.${c}`) }))} />
          </Field>
        )}
        {scope === "plot" && (
          <>
            <Field label={t("ui.cost.farm")}>
              <Select value={farmId} onChange={(e) => { setFarmId(e.target.value); setPlotId(""); }} options={[{ value: "", label: "—" }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
            </Field>
            <Field label={t("ui.cost.plot")}>
              <Select value={plotId} onChange={(e) => setPlotId(e.target.value)} options={[{ value: "", label: "—" }, ...(farm.data?.plots ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
            </Field>
          </>
        )}
        <Field label={t("ui.cost.category")}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} options={COST_CATEGORIES.map((c) => ({ value: c, label: tk(`ui.cost.category_${c}`) }))} />
        </Field>
        <Field label={t("ui.cost.activity")}>
          <Select value={activity} onChange={(e) => setActivity(e.target.value)} options={[{ value: "", label: t("ui.cost.all") }, ...ACTIVITIES.map((a) => ({ value: a, label: tk(`ui.activity.${a}`) }))]} />
        </Field>
        <Field label={t("ui.budget.planned")}>
          <Input required type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending || (scope === "plot" && !plotId)} />
      </Form>
    </Modal>
  );
}
