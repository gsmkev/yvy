import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BILLINGS, LIMITS, priceFor, usdToGs, type Billing } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
import { fmtGs } from "../lib/money";
import { useRates } from "./erp/ExchangeRatesPanel";
import { Field, Input, SectionHead, Stat, Tabs } from "./ui";

interface Dashboard {
  areaByCrop: { kind: "crop" | "pasture"; ha: number }[];
}

const usd = (n: number) => "US$ " + new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const num = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** ADR 0005 §5: lo que le corresponde a la organización por año y por cuota, y una calculadora. Es informativo: el cobro es manual. */
export function PlanPrice({ billing, onBilling }: { billing: Billing; onBilling: (b: Billing) => void }) {
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => get<Dashboard>("/org/dashboard"), staleTime: 60_000 });
  const rates = useRates();
  const rate = rates.data?.[0]?.usdToPyg ?? LIMITS.pricing.usdToPyg;
  const [calc, setCalc] = useState({ crops: "", cattle: "" });
  const sum = (kind: "crop" | "pasture") =>
    Math.round((dash.data?.areaByCrop ?? []).filter((a) => a.kind === kind).reduce((n, a) => n + a.ha, 0));
  const crops = sum("crop");
  const cattle = sum("pasture");
  const mine = priceFor(crops, cattle, billing);
  const other = priceFor(num(calc.crops), num(calc.cattle), billing);
  return (
    <div className="mt-8">
      <SectionHead title={t("ui.plan.priceTitle")} />
      <p className="mt-3 text-sm text-tinta-2">{t("ui.plan.priceIntro")}</p>
      <div className="mt-4">
        <span className="eyebrow">{t("ui.plan.billing")}</span>
        <Tabs<Billing>
          tabs={BILLINGS.map((b) => ({ id: b, label: t(`ui.plan.billing_${b}`) }))}
          value={billing}
          onChange={onBilling}
        />
        {billing === "annual" && <p className="mt-1 text-sm text-tinta-2">{t("ui.plan.billingGift")}</p>}
      </div>
      {dash.data && (
        <div className="mt-4">
          <p className="text-sm text-tinta-2">
            {t("ui.plan.priceYours", { crops: fmtNum(crops), cattle: fmtNum(cattle) })}
          </p>
          <Quote q={mine} billing={billing} rate={rate} />
        </div>
      )}
      <div className="mt-6 max-w-md">
        <span className="eyebrow">{t("ui.plan.calcTitle")}</span>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Field label={t("ui.plan.calcCrops")}>
            <Input inputMode="decimal" value={calc.crops} onChange={(e) => setCalc({ ...calc, crops: e.target.value })} />
          </Field>
          <Field label={t("ui.plan.calcCattle")}>
            <Input inputMode="decimal" value={calc.cattle} onChange={(e) => setCalc({ ...calc, cattle: e.target.value })} />
          </Field>
        </div>
        <Quote q={other} billing={billing} rate={rate} />
      </div>
      <p className="mt-4 text-xs text-tinta-2">{t("ui.plan.priceNote", { rate: fmtNum(rate) })}</p>
    </div>
  );
}

function Quote({
  q,
  billing,
  rate,
}: {
  q: ReturnType<typeof priceFor>;
  billing: Billing;
  rate: number;
}) {
  return (
    <>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        <Stat label={t("ui.plan.priceYear")} value={fmtGs(usdToGs(q.year, rate))} note={usd(q.year)} />
        <Stat
          label={t("ui.plan.priceInstallment")}
          value={fmtGs(usdToGs(q.perInstallment, rate))}
          note={`${usd(q.perInstallment)} · ${t(`ui.plan.priceInstallments_${billing}`)}`}
        />
      </dl>
      <p className="mt-2 text-xs text-tinta-2">
        {t("ui.plan.pricePerHa", { n: new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(q.perHa) })}
        {q.minApplied ? ` · ${t("ui.plan.priceMin")}` : ""}
      </p>
    </>
  );
}
