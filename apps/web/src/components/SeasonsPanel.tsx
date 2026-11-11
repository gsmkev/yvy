import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CROPS } from "@yvy/shared";
import { del, patch, post, put } from "../lib/api";
import { fmtIsoDate, fmtNum } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useSeasons } from "../lib/queries";
import type { Plot, PlotSeason, Season } from "../lib/types";
import { Button, ConfirmModal, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "./ui";

/** Campañas de la organización y plan de cultivo por lote (A-01). */
export function SeasonsPanel({ farmId, plots, canEdit }: { farmId: string; plots: Plot[]; canEdit: boolean }) {
  const q = useSeasons(farmId);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState<Plot | null>(null);
  const [confirming, setConfirming] = useState(false);
  const seasons = q.data?.seasons ?? [];
  // Sin elección, la campaña activa más reciente (la lista ya viene ordenada así).
  useEffect(() => {
    if (!selected || !seasons.some((s) => s.id === selected)) setSelected(seasons[0]?.id ?? null);
  }, [q.data]);
  const season = seasons.find((s) => s.id === selected) ?? null;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["seasons"] });
    qc.invalidateQueries({ queryKey: ["plot-history"] });
  };
  const toggle = useMutation({
    mutationFn: (s: Season) => patch(`/org/seasons/${s.id}`, { active: !s.active }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (s: Season) => del(`/org/seasons/${s.id}`),
    onSuccess: () => {
      toast(t("ui.toastSeasonDeleted"));
      setConfirming(false);
      refresh();
    },
  });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const planOf = (plotId: string) =>
    season ? (q.data?.plotSeasons ?? []).find((p) => p.plotId === plotId && p.seasonId === season.id) : undefined;
  const cropPlots = plots.filter((p) => p.kind === "crop");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {seasons.length > 0 && (
          <Select
            aria-label={t("ui.season")}
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value)}
            options={seasons.map((s) => ({
              value: s.id,
              label: `${s.name} · ${s.active ? t("ui.seasonActive") : t("ui.seasonClosed")}`,
            }))}
          />
        )}
        {canEdit && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t("ui.seasonNew")}
          </Button>
        )}
      </div>

      {!season ? (
        <Empty title={t("ui.seasonsTitle")}>{t("ui.seasonNone")}</Empty>
      ) : (
        <>
          <p className="num text-sm text-tinta-2">
            {season.startDate ? fmtIsoDate(season.startDate) : "—"} → {season.endDate ? fmtIsoDate(season.endDate) : "—"}
          </p>
          {canEdit && (
            <div className="flex gap-4 text-sm">
              <button
                className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-surco hover:underline"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate(season)}
              >
                {season.active ? t("ui.seasonClose") : t("ui.seasonReopen")}
              </button>
              <button
                className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-peligro hover:underline"
                onClick={() => setConfirming(true)}
              >
                {t("ui.seasonDelete")}
              </button>
            </div>
          )}
          <h3 className="eyebrow mt-2">{t("ui.seasonPlanTitle")}</h3>
          {cropPlots.length === 0 ? (
            <Empty title={t("ui.noPlots")} />
          ) : (
            <ul className="divide-y divide-linea border-y border-linea">
              {cropPlots.map((p) => {
                const plan = planOf(p.id);
                return (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{p.name}</span>
                      <span className="num ml-2 text-xs text-tinta-2">{fmtNum(p.areaHa)} ha</span>
                      <span className="mt-0.5 block text-tinta-2">
                        {plan ? <PlanSummary plan={plan} /> : t("ui.seasonPlanEmpty")}
                      </span>
                    </span>
                    {canEdit && (
                      <button
                        className="shrink-0 cursor-pointer text-tinta-2 underline-offset-4 hover:text-surco hover:underline"
                        onClick={() => setPlanning(p)}
                      >
                        {t("ui.seasonPlanEdit")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {creating && (
        <NewSeasonModal
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setSelected(id);
            refresh();
          }}
        />
      )}
      {planning && season && (
        <PlanModal
          plot={planning}
          season={season}
          plan={planOf(planning.id)}
          onClose={() => setPlanning(null)}
          onSaved={refresh}
        />
      )}
      {confirming && season && (
        <ConfirmModal
          title={season.name}
          message={t("ui.seasonConfirmDelete", { name: season.name })}
          confirmLabel={t("ui.delete")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(season)}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export function PlanSummary({ plan }: { plan: PlotSeason }) {
  const parts = [
    plan.crop ? tk(`fields.crop_${plan.crop}`) : null,
    plan.variety,
    plan.plannedSowingDate ? `${t("ui.seasonPlannedSowing")} ${fmtIsoDate(plan.plannedSowingDate)}` : null,
    plan.targetYieldTHa !== null ? `${fmtNum(plan.targetYieldTHa)} t/ha` : null,
  ].filter(Boolean);
  return <span className="num">{parts.length ? parts.join(" · ") : t("ui.seasonPlanEmpty")}</span>;
}

function NewSeasonModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ name: "", startDate: "", endDate: "" });
  const create = useMutation({
    mutationFn: () =>
      post<{ id: string }>("/org/seasons", {
        name: f.name,
        startDate: f.startDate || null,
        endDate: f.endDate || null,
        active: true,
      }),
    onSuccess: (r) => {
      toast(t("ui.toastSeasonSaved"));
      onSaved(r.id);
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={t("ui.seasonNew")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label={t("ui.seasonName")}>
          <Input
            required
            autoFocus
            value={f.name}
            onChange={set("name")}
            placeholder={t("ui.seasonNamePlaceholder")}
            maxLength={80}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.seasonStart")}>
            <Input type="date" value={f.startDate} onChange={set("startDate")} />
          </Field>
          <Field label={t("ui.seasonEnd")}>
            <Input type="date" value={f.endDate} min={f.startDate || undefined} onChange={set("endDate")} />
          </Field>
        </div>
        {create.error && <ErrorBox error={create.error} />}
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {t("ui.save")}
        </Button>
      </form>
    </Modal>
  );
}

function PlanModal({
  plot,
  season,
  plan,
  onClose,
  onSaved,
}: {
  plot: Plot;
  season: Season;
  plan: PlotSeason | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    crop: plan?.crop ?? plot.crop ?? "",
    variety: plan?.variety ?? "",
    plannedSowingDate: plan?.plannedSowingDate ?? "",
    targetYieldTHa: plan?.targetYieldTHa?.toString() ?? "",
  });
  const url = `/org/seasons/${season.id}/plots/${plot.id}`;
  const save = useMutation({
    mutationFn: () =>
      put(url, {
        crop: f.crop || null,
        variety: f.variety.trim() || null,
        plannedSowingDate: f.plannedSowingDate || null,
        targetYieldTHa: f.targetYieldTHa ? Number(f.targetYieldTHa.replace(",", ".")) : null,
      }),
    onSuccess: () => {
      toast(t("ui.toastSeasonPlanSaved"));
      onSaved();
      onClose();
    },
  });
  const clear = useMutation({
    mutationFn: () => del(url),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={`${plot.name} · ${season.name}`} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.crop")}>
            <Select
              value={f.crop}
              onChange={set("crop")}
              options={[{ value: "", label: "—" }, ...CROPS.map((c) => ({ value: c, label: tk(`fields.crop_${c}`) }))]}
            />
          </Field>
          <Field label={t("ui.seasonVariety")}>
            <Input value={f.variety} onChange={set("variety")} maxLength={80} />
          </Field>
          <Field label={t("ui.seasonPlannedSowing")}>
            <Input type="date" value={f.plannedSowingDate} onChange={set("plannedSowingDate")} />
          </Field>
          <Field label={t("ui.seasonTargetYield")}>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={f.targetYieldTHa}
              onChange={set("targetYieldTHa")}
            />
          </Field>
        </div>
        {(save.error || clear.error) && <ErrorBox error={save.error ?? clear.error} />}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("ui.seasonPlanSave")}
          </Button>
          {plan && (
            <Button variant="quiet" disabled={clear.isPending} onClick={() => clear.mutate()}>
              {t("ui.seasonPlanClear")}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
