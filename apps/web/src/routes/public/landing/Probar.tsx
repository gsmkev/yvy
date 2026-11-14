/** Cierre de la landing: el formulario de prueba. Guarda el pedido en el Worker (POST /public/trial-requests). */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { LIMITS } from "@yvy/shared";
import { post } from "../../../lib/api";
import { PLACES_PY } from "../../../lib/places-py";
import { SignupLink, WhatsappLink } from "./actions";
import { ctaCrops, L, TRIAL_DAYS } from "./content";
import { Consent, Field, Honeypot, inputCls } from "./form";
import { media } from "./media";
import { FadeIn, Poster, SignalZone, Title } from "./primitives";

export function CTA() {
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [crops, setCrops] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const departments = useMemo(() => PLACES_PY.filter((p) => p.kind === "department").map((p) => p.name), []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = (k: string) => String(fd.get(k) ?? "").trim();
    setProblem(null);
    setState("saving");
    try {
      await post("/public/trial-requests", {
        name: text("name"),
        whatsapp: text("whatsapp"),
        company: text("company"),
        crops,
        hectares: text("hectares"),
        employees: text("employees"),
        department: text("department"),
        consent,
        website,
      });
      setState("done");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
      setState("idle");
    }
  };

  return (
    <SignalZone mode="online" id="probar" className="relative overflow-hidden bg-surco text-lino">
      <Poster img={media.cta} sizes="100vw" className="media-treat absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-surco/75" />
      <div className="relative px-5 py-28 md:px-10 md:py-40">
        <Title text={L("cta.title", { days: TRIAL_DAYS })} className="trial-title max-w-[20ch]" />
        <FadeIn>
          <p className="body-yvy mt-8 text-lino/85">{L("cta.lead")}</p>
        </FadeIn>
        <form onSubmit={onSubmit} className="relative mt-14 max-w-3xl">
          <div className="grid md:grid-cols-2 md:gap-x-10">
            <Field n="01" label={L("cta.fName")}>
              <input required name="name" maxLength={80} className={inputCls} autoComplete="name" />
            </Field>
            <Field n="02" label={L("cta.fWhatsapp")}>
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-lino/70">+595</span>
                <input required name="whatsapp" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={30} className={inputCls} />
              </span>
            </Field>
            <Field n="03" label={L("cta.fCompany")}>
              <input name="company" maxLength={120} autoComplete="organization" className={inputCls} />
            </Field>
            <Field n="05" label={L("cta.fHectares")}>
              <input name="hectares" inputMode="numeric" className={inputCls} />
            </Field>
            <Field n="06" label={L("cta.fEmployees")}>
              <input name="employees" inputMode="numeric" className={inputCls} />
            </Field>
            <Field n="07" label={L("cta.fDepartment")}>
              <input name="department" list="landing-departamentos" maxLength={60} className={inputCls} />
              <datalist id="landing-departamentos">
                {departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </Field>
          </div>
          <div className="grid grid-cols-[28px_1fr] gap-x-3 py-3">
            <span className="mono-yvy pt-1 text-lino/60" aria-hidden>
              04
            </span>
            <div role="group" aria-labelledby="cta-crops-label">
              <span id="cta-crops-label" className="mono-yvy block text-lino/80">
                {L("cta.fCrops")}
              </span>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {ctaCrops().map((c) => {
                  const on = crops.includes(c);
                  return (
                    <button
                      type="button"
                      key={c}
                      aria-pressed={on}
                      onClick={() => setCrops(on ? crops.filter((x) => x !== c) : [...crops, c])}
                      className={`link-yvy font-display text-2xl ${on ? "link-on text-soja" : "text-lino/75"}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <Honeypot value={website} onChange={setWebsite} />
          <div className="mt-4">
            <Consent checked={consent} onChange={setConsent}>
              {L("cta.consent", { days: Math.round(LIMITS.trialRequests.retentionMs / 86_400_000) })}{" "}
              <Link to="/privacidad" className="link-yvy text-lino">
                {L("cta.privacy")}
              </Link>
            </Consent>
          </div>
          {problem && (
            <p role="alert" className="mono-yvy mt-3 text-trigo">
              {problem}
            </p>
          )}
          <button
            type="submit"
            disabled={state !== "idle" || !consent}
            className={`mono-yvy mt-10 block w-full px-6 py-6 text-left text-[14px] transition-colors duration-[400ms] disabled:cursor-not-allowed ${
              state === "saving" ? "lp-pending bg-transparent text-trigo" : consent || state === "done" ? "bg-soja text-surco" : "bg-soja/40 text-lino/70"
            }`}
          >
            {state === "idle" ? (
              L("cta.submit")
            ) : state === "saving" ? (
              L("cta.saving")
            ) : (
              <span role="status" className="font-sans text-lg normal-case tracking-normal">
                {L("cta.done")}
              </span>
            )}
          </button>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-3">
            {state === "done" && <SignupLink className="link-on font-display text-2xl text-soja" label={L("cta.createNow")} />}
            <WhatsappLink text="cta.whatsappText" label={L("cta.whatsappLabel")} />
          </div>
        </form>
      </div>
    </SignalZone>
  );
}
