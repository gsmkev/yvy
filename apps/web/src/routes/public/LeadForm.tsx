/** Informe gratis de riesgo climático a cambio del email (V-04): email, punto del campo y consentimiento explícito. */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LIMITS } from "@yvy/shared";
import { ErrorBox } from "../../components/ui";
import { post } from "../../lib/api";
import { inParaguay, parseCoords } from "../../lib/leads";
import { t } from "../../lib/i18n";

const field = "mt-1 h-11 w-full rounded-md border border-linea bg-papel px-3 text-base text-surco";
const button =
  "inline-flex h-11 cursor-pointer items-center justify-center rounded-md border border-accion bg-accion px-5 text-sm font-medium text-sobre transition-colors duration-150 hover:bg-accion-2 disabled:cursor-not-allowed disabled:opacity-45";

export function LeadForm() {
  const [email, setEmail] = useState("");
  const [place, setPlace] = useState("");
  const [consent, setConsent] = useState(false);
  // Campo trampa: queda fuera de la vista y de la tabulación; un robot lo llena.
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "locating" | "sending" | "done">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

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
    setError(null);
    const point = parseCoords(place);
    if (!point) return setProblem(t("ui.leadBadCoords"));
    if (!inParaguay(point)) return setProblem(t("ui.leadOutside"));
    setProblem(null);
    setState("sending");
    try {
      await post("/public/leads", { email, lat: point.lat, lon: point.lon, consent, website });
      setState("done");
    } catch (err) {
      setError(err);
      setState("idle");
    }
  };

  if (state === "done")
    return (
      <div className="rounded-lg border border-linea bg-papel p-5" role="status">
        <h3 className="font-serif text-xl font-semibold">{t("ui.leadDoneTitle")}</h3>
        <p className="mt-2 text-tinta-2">{t("ui.leadDoneText")}</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-linea bg-papel p-5">
      <label className="text-sm font-medium">
        {t("ui.leadEmail")}
        <input
          className={field}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <div>
        <label className="text-sm font-medium" htmlFor="lead-place">
          {t("ui.leadPlace")}
        </label>
        <input
          id="lead-place"
          className={`${field} num`}
          inputMode="text"
          required
          value={place}
          aria-describedby="lead-place-hint"
          onChange={(e) => setPlace(e.target.value)}
        />
        <p id="lead-place-hint" className="mt-1 text-sm text-tinta-2">
          {t("ui.leadPlaceHint")}
        </p>
        <button
          type="button"
          className="mt-2 cursor-pointer text-sm font-medium text-accion underline-offset-4 hover:underline disabled:opacity-45"
          disabled={state !== "idle"}
          onClick={useMine}
        >
          {state === "locating" ? t("ui.leadLocating") : t("ui.leadUseMine")}
        </button>
      </div>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-accion"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          {t("ui.leadConsent", { days: Math.round(LIMITS.leads.retentionMs / 86_400_000) })}{" "}
          <Link to="/privacidad" className="font-medium text-accion underline-offset-4 hover:underline">
            {t("ui.leadConsentLink")}
          </Link>
        </span>
      </label>
      {problem ? (
        <p role="alert" className="text-sm text-peligro">
          {problem}
        </p>
      ) : null}
      {error ? <ErrorBox error={error} /> : null}
      <div>
        <button type="submit" className={button} disabled={state !== "idle" || !consent}>
          {state === "sending" ? t("ui.leadSending") : t("ui.leadSend")}
        </button>
      </div>
    </form>
  );
}
