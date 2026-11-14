/** Informe gratis de riesgo climático a cambio del email (V-04): email, punto del campo y consentimiento explícito. */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LIMITS } from "@yvy/shared";
import { post } from "../../../lib/api";
import { inParaguay, parseCoords } from "../../../lib/leads";
import { t } from "../../../lib/i18n";
import { L } from "./content";
import { Consent, Field, Honeypot, inputCls } from "./form";
import { FadeIn, Title } from "./primitives";

export function LeadForm() {
  const [email, setEmail] = useState("");
  const [place, setPlace] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "locating" | "sending" | "done">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  const useMine = () => {
    setProblem(null);
    if (!navigator.geolocation) return setProblem(t("ui.leadLocateFailed"));
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPlace(`${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`);
        setState("idle");
      },
      () => {
        setProblem(t("ui.leadLocateFailed"));
        setState("idle");
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const point = parseCoords(place);
    if (!point) return setProblem(t("ui.leadBadCoords"));
    if (!inParaguay(point)) return setProblem(t("ui.leadOutside"));
    setProblem(null);
    setState("sending");
    try {
      await post("/public/leads", { email, lat: point.lat, lon: point.lon, consent, website });
      setState("done");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
      setState("idle");
    }
  };

  return (
    <div id="informe-gratis" className="mt-28 grid gap-12 border-t border-linea-oscuro pt-16 lg:grid-cols-[1fr_1fr] lg:gap-20">
      <div>
        <p className="mono-yvy mb-6 text-lino/70">{L("reportRisk.label")}</p>
        <Title text={L("reportRisk.title")} as="h3" className="text-[clamp(2rem,4.2vw,3.6rem)] max-w-[16ch]" />
        <FadeIn>
          <p className="body-yvy mt-6 text-lino/80">{L("reportRisk.text")}</p>
        </FadeIn>
      </div>

      {state === "done" ? (
        <div role="status" className="self-center border-l border-soja pl-6">
          <p className="font-display text-3xl leading-tight">{L("lead.doneTitle")}</p>
          <p className="mt-4 max-w-[44ch] text-[17px] text-lino/80">{L("lead.doneText")}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="max-w-xl">
          <Field n="01" label={L("lead.email")}>
            <input className={inputCls} type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field n="02" label={L("lead.place")}>
            <input
              className={inputCls}
              name="place"
              inputMode="text"
              required
              value={place}
              aria-describedby="lead-place-hint"
              onChange={(e) => setPlace(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-[28px_1fr] gap-x-3">
            <span />
            <div>
              <p id="lead-place-hint" className="text-[15px] text-lino/70">
                {L("lead.placeHint")}
              </p>
              <button type="button" className="link-yvy mono-yvy mt-3 text-lino disabled:opacity-60" disabled={state !== "idle"} onClick={useMine}>
                {state === "locating" ? L("lead.locating") : L("lead.useMine")}
              </button>
            </div>
          </div>
          <Honeypot value={website} onChange={setWebsite} />
          <div className="mt-4">
            <Consent checked={consent} onChange={setConsent}>
              {L("lead.consent", { days: Math.round(LIMITS.leads.retentionMs / 86_400_000) })}{" "}
              <Link to="/privacidad" className="link-yvy text-lino">
                {L("lead.privacy")}
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
            className={`mono-yvy mt-8 block w-full px-6 py-6 text-left text-[14px] transition-colors duration-[400ms] disabled:cursor-not-allowed ${
              state === "sending" ? "lp-pending bg-transparent text-trigo" : consent ? "bg-soja text-surco" : "bg-soja/40 text-lino/70"
            }`}
          >
            {state === "sending" ? L("lead.sending") : L("lead.send")}
          </button>
        </form>
      )}
    </div>
  );
}
