import { useMutation, useQuery } from "@tanstack/react-query";
import { FERT_LAYER_KEYS, FERT_LAYER_PARAM, type FertLayerKey } from "@yvy/shared";
import { get, post } from "../lib/api";
import { fmtDate } from "../lib/format";
import { t } from "../lib/i18n";
import { useFarm } from "../lib/queries";
import { Button, ErrorBox, Spinner, toast } from "./ui";

interface FertilityResponse {
  minPoints: number;
  points: Record<FertLayerKey, number>;
}

/** Mapas de fertilidad interpolados (A-31): cuántos puntos tiene cada parámetro y pedido del cálculo. */
export function FertilityPanel({ farmId }: { farmId: string }) {
  const q = useQuery({ queryKey: ["fertility", farmId], queryFn: () => get<FertilityResponse>(`/org/farms/${farmId}/fertility`) });
  const farm = useFarm(farmId);
  const request = useMutation({
    mutationFn: () => post(`/org/farms/${farmId}/fertility-maps`, {}),
    onSuccess: () => toast(t("ui.fertRequested")),
  });
  const d = q.data;
  const any = d ? Object.values(d.points).some((n) => n >= d.minPoints) : false;
  const total = d ? Math.max(...Object.values(d.points)) : 0;
  const published = (k: FertLayerKey) =>
    (farm.data?.layers ?? []).filter((l) => l.layer === k).sort((a, b) => b.acquiredAt - a.acquiredAt)[0]?.acquiredAt;
  return (
    <section aria-labelledby="fert-h" className="flex flex-col gap-3">
      <h3 id="fert-h" className="font-serif text-lg font-semibold">
        {t("ui.fertTitle")}
      </h3>
      <p className="text-sm text-tinta-2">{t("ui.fertIntro")}</p>
      {q.isLoading && <Spinner rows={2} h={32} />}
      {q.error && <ErrorBox error={q.error} />}
      {d && total === 0 && <p className="text-sm">{t("ui.fertNoneAtAll")}</p>}
      {d && total > 0 && (
        <>
          <ul className="divide-y divide-linea border-y border-linea text-sm">
            {FERT_LAYER_KEYS.map((k) => {
              const n = d.points[k];
              const when = published(k);
              return (
                <li key={k} className="num flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                  <span>{t(`ui.soilParam_${FERT_LAYER_PARAM[k]}` as "ui.soilParam_ph")}</span>
                  <span className="text-tinta-2">
                    {t("ui.fertPoints", { n, min: d.minPoints })} · {n >= d.minPoints ? t("ui.fertReady") : t("ui.fertMissing", { n: d.minPoints - n })}
                    {when ? ` · ${t("ui.fertPublished", { date: fmtDate(when) })}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-tinta-2">{t("ui.fertNeed", { min: d.minPoints })}</p>
        </>
      )}
      {request.error && <ErrorBox error={request.error} />}
      <div>
        <Button variant="primary" disabled={!any || request.isPending} onClick={() => request.mutate()}>
          {t("ui.fertCompute")}
        </Button>
      </div>
    </section>
  );
}
