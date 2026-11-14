import { useQuery } from "@tanstack/react-query";
import { spiCategory, type FarmSpi } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtMm, fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
import { ErrorBox, Spinner } from "./ui";

/** SPI a 1, 3 y 6 meses (C-07): la lluvia reciente contra la normal 1991-2020, en puntaje estandarizado. */
export function SpiPanel({ farmId }: { farmId: string }) {
  const q = useQuery({
    queryKey: ["spi", farmId],
    queryFn: () => get<{ computedAt: number | null; report: FarmSpi | null }>(`/org/farms/${farmId}/spi`),
    staleTime: 60 * 60_000,
  });
  const r = q.data?.report;
  return (
    <section aria-labelledby="spi-h" className="flex flex-col gap-2 border-t border-linea pt-5">
      <h3 id="spi-h" className="text-[18px] leading-6 font-semibold">
        {t("ui.spiTitle")}
      </h3>
      {q.isLoading && <Spinner rows={1} h={40} />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && !r && <p className="text-sm text-tinta-2">{t("ui.spiNone")}</p>}
      {r && (
        <>
          <p className="text-sm text-tinta-2">{t("ui.spiIntro", { month: r.throughMonth })}</p>
          <ul className="divide-y divide-linea border-y border-linea text-sm">
            {r.scales.map((s) => (
              <li key={s.scale} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                <span className="font-medium">{t("ui.spiScale", { n: s.scale })}</span>
                {s.spi === null ? (
                  <span className="text-tinta-2">{t(s.reason === "no_reference" ? "ui.spiNoReference" : "ui.spiIncomplete")}</span>
                ) : (
                  <span className="num">
                    <strong className={s.spi <= -1 ? "text-peligro" : ""}>{fmtNum(s.spi)}</strong>
                    <span className="text-tinta-2">
                      {" "}
                      · {t(`ui.spiCat_${spiCategory(s.spi)}` as "ui.spiCat_normal")}
                      {s.mm !== null && s.normalMm !== null
                        ? ` · ${t("ui.spiMm", { mm: fmtMm(s.mm), normal: fmtMm(s.normalMm) })}`
                        : ""}
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-tinta-2">{t("ui.spiNote")}</p>
          <p className="text-xs text-tinta-2">
            {t("attribution.chirps")} · {t("attribution.nasaPower")}
          </p>
        </>
      )}
    </section>
  );
}
