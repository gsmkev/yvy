import { useWithdrawal } from "../lib/agri2";
import { fmtIsoDate } from "../lib/format";
import { t } from "../lib/i18n";
import { Empty, ErrorBox, Spinner } from "./ui";

/** Carencia antes de cosechar (A-14): lotes con restricción vigente y cosechas hechas antes de cumplirla. */
export function WithdrawalPanel({ farmId }: { farmId: string }) {
  const q = useWithdrawal(farmId);
  const d = q.data;
  return (
    <section aria-labelledby="withdrawal-h" className="flex flex-col gap-3">
      <h3 id="withdrawal-h" className="font-serif text-lg font-semibold">
        {t("ui.withdrawalTitle")}
      </h3>
      <p className="text-sm text-tinta-2">{t("ui.withdrawalIntro")}</p>
      {q.isLoading && <Spinner rows={2} h={32} />}
      {q.error && <ErrorBox error={q.error} />}
      {d && d.restrictions.length === 0 && d.violations.length === 0 && (
        <Empty title={t("ui.withdrawalTitle")}>{t("ui.withdrawalNone")}</Empty>
      )}
      {d && d.restrictions.length > 0 && (
        <ul className="divide-y divide-linea border-y border-linea text-sm">
          {d.restrictions.map((r) => (
            <li key={r.plotId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
              <span>
                <span className="font-medium">{r.plotName}</span>
                <span className="block text-xs text-tinta-2">
                  {t("ui.withdrawalApplied", { product: r.product, date: fmtIsoDate(r.appliedOn) })}
                </span>
              </span>
              <span className="num font-medium text-peligro">
                {t("ui.withdrawalUntil", { date: fmtIsoDate(r.safeFrom) })}
                <span className="font-normal text-tinta-2"> · {t(r.daysLeft === 1 ? "ui.withdrawalDayOne" : "ui.withdrawalDays", { n: r.daysLeft })}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {d && d.violations.length > 0 && (
        <div>
          <h4 className="eyebrow mb-1">{t("ui.withdrawalViolations")}</h4>
          <ul className="divide-y divide-linea border-y border-linea text-sm">
            {d.violations.map((v) => (
              <li key={`${v.plotId}${v.harvestedOn}${v.product}`} className="py-2.5 text-peligro">
                {t("ui.withdrawalViolation", {
                  plot: v.plotName,
                  date: fmtIsoDate(v.harvestedOn),
                  product: v.product,
                  safe: fmtIsoDate(v.safeFrom),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {d && d.unknown.length > 0 && (
        <div>
          <h4 className="eyebrow mb-1">{t("ui.withdrawalUnknown")}</h4>
          <p className="text-sm text-tinta-2">
            {d.unknown.map((u) => `${u.product} (${u.plotName})`).join(", ")}
          </p>
        </div>
      )}
    </section>
  );
}
