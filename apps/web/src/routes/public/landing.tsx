import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { post, setSession, type Session } from "../../lib/api";
import { whatsappUrl } from "../../lib/config";
import { fmtNum } from "../../lib/format";
import { t } from "../../lib/i18n";
import { priceFor } from "../../lib/pricing";
import { ErrorBox } from "../../components/ui";
import { LeadForm } from "./LeadForm";
import { PublicShell } from "./PublicShell";

const btn =
  "inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-medium transition-colors duration-150";
const primary = `${btn} cursor-pointer border border-accion bg-accion text-sobre hover:bg-accion-2 disabled:cursor-not-allowed disabled:opacity-45`;
const secondary = `${btn} cursor-pointer border border-linea bg-papel text-surco hover:border-tinta-2/40`;

/** La demo existe solo si el Worker tiene DEMO_ORG_ID y DEMO_USER_ID (si no, GET /auth/demo no responde ok). */
function useDemoAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/auth/demo")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { available?: boolean } | null) => live && setAvailable(j?.available === true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return available;
}

const STEPS = [
  ["ui.publicStep1Title", "ui.publicStep1Text"],
  ["ui.publicStep2Title", "ui.publicStep2Text"],
  ["ui.publicStep3Title", "ui.publicStep3Text"],
] as const;

const DATA = ["publicDataSentinel", "publicDataChirps", "publicDataPower", "publicDataFirms", "publicDataMet"] as const;

const usd = (n: number) => `US$ ${fmtNum(Math.round(n))}`;

function Calculator() {
  const [crops, setCrops] = useState("");
  const [cattle, setCattle] = useState("");
  const p = priceFor(Number(crops), Number(cattle));
  const field = "mt-1 h-11 w-full rounded-md border border-linea bg-papel px-3 text-base text-surco";
  return (
    <div className="rounded-lg border border-linea bg-papel p-5">
      <h3 className="font-serif text-xl font-semibold">{t("ui.publicCalcTitle")}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          {t("ui.publicCalcCrops")}
          <input
            className={`${field} num`}
            inputMode="numeric"
            min={0}
            type="number"
            value={crops}
            onChange={(e) => setCrops(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          {t("ui.publicCalcCattle")}
          <input
            className={`${field} num`}
            inputMode="numeric"
            min={0}
            type="number"
            value={cattle}
            onChange={(e) => setCattle(e.target.value)}
          />
        </label>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4" aria-live="polite">
        <div>
          <dt className="text-sm text-tinta-2">{t("ui.publicCalcPerMonth")}</dt>
          <dd className="num font-serif text-[28px] leading-tight font-semibold">{usd(p.month)}</dd>
        </div>
        <div>
          <dt className="text-sm text-tinta-2">{t("ui.publicCalcPerYear")}</dt>
          <dd className="num font-serif text-[28px] leading-tight font-semibold">{usd(p.year)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-tinta-2">
        {p.minApplied ? `${t("ui.publicCalcMinApplied")} ` : ""}
        {t("ui.publicCalcNote")}
      </p>
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const demoAvailable = useDemoAvailable();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const tryDemo = async () => {
    setBusy(true);
    setError(null);
    try {
      setSession(await post<Session>("/auth/demo"));
      navigate({ to: "/" });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicShell>
      <section className="mx-auto grid w-full max-w-5xl gap-8 px-4 pt-6 pb-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12 lg:pt-12">
        <div>
          <h1 className="text-[34px] leading-[1.1] sm:text-[44px]">{t("ui.publicPromise")}</h1>
          <p className="mt-5 max-w-xl text-lg text-tinta-2">{t("ui.publicLead")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {demoAvailable && (
              <button type="button" className={primary} disabled={busy} onClick={tryDemo}>
                {busy ? t("ui.publicTrying") : t("ui.publicTry")}
              </button>
            )}
            <Link to="/ingresar" search={{ modo: "registro" }} className={demoAvailable ? secondary : primary}>
              {t("ui.publicSignup")}
            </Link>
          </div>
          {error ? (
            <div className="mt-4">
              <ErrorBox error={error} />
            </div>
          ) : null}
          <div className="mt-5 flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
            <a
              href={whatsappUrl(t("ui.publicWhatsappText"))}
              className="font-medium text-accion underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {t("ui.publicWhatsapp")}
            </a>
            <a href="/descargar-app" className="font-medium text-accion underline-offset-4 hover:underline">
              {t("ui.publicDownload")}
            </a>
          </div>
        </div>
        <figure>
          <img
            src="/campo-itapua.webp"
            alt=""
            className="aspect-[4/3] w-full rounded-lg object-cover"
            width={800}
            height={600}
          />
          <figcaption className="mt-2 text-xs text-tinta-2">
            {t("ui.publicImageCaption")} {t("attribution.copernicus")}.
          </figcaption>
        </figure>
      </section>

      <section className="border-t border-linea">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="font-serif text-[28px] leading-tight font-semibold">{t("ui.publicHowTitle")}</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map(([title, text], i) => (
              <li key={title}>
                <p className="num font-serif text-[32px] leading-none font-semibold text-accion">{i + 1}</p>
                <h3 className="mt-3 text-lg font-semibold">{t(title)}</h3>
                <p className="mt-1 text-tinta-2">{t(text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-linea">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-[28px] leading-tight font-semibold">{t("ui.riskLandingTitle")}</h2>
            <p className="mt-3 text-tinta-2">{t("ui.riskLandingText")}</p>
          </div>
          <LeadForm />
        </div>
      </section>

      <section id="agronomos" className="border-t border-linea">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-serif text-[28px] leading-tight font-semibold">{t("ui.agroTitle")}</h2>
            <p className="mt-3 text-tinta-2">{t("ui.agroText")}</p>
          </div>
          <a href={whatsappUrl(t("ui.agroWhatsappText"))} className={secondary} target="_blank" rel="noreferrer">
            {t("ui.agroCta")}
          </a>
        </div>
      </section>

      <section className="border-t border-linea bg-papel">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="font-serif text-[28px] leading-tight font-semibold">{t("ui.publicDataTitle")}</h2>
          <p className="mt-3 max-w-2xl text-tinta-2">{t("ui.publicDataText")}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {DATA.map((k) => (
              <li key={k} className="border-l-2 border-soja pl-3">
                {t(`ui.${k}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-linea">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-[28px] leading-tight font-semibold">{t("ui.publicPricingTitle")}</h2>
            <p className="mt-3 text-tinta-2">{t("ui.publicPricingText")}</p>
            <ul className="mt-5 space-y-1">
              <li>{t("ui.publicPriceCrops")}</li>
              <li>{t("ui.publicPriceCattle")}</li>
              <li>{t("ui.publicPriceMin")}</li>
            </ul>
            <h3 className="mt-8 font-serif text-xl font-semibold">{t("ui.publicTrialTitle")}</h3>
            <p className="mt-1 text-tinta-2">{t("ui.publicTrialText")}</p>
          </div>
          <Calculator />
        </div>
      </section>

      <section className="border-t border-linea bg-surco text-lino">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p className="max-w-md font-serif text-2xl leading-tight font-semibold">{t("ui.publicPromise")}</p>
          <Link to="/ingresar" search={{ modo: "registro" }} className={`${btn} bg-lino text-surco hover:bg-papel`}>
            {t("ui.publicSignup")}
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
