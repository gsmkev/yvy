/** Entradas al producto desde la landing: demo, ingresar, crear cuenta, app para Android y WhatsApp. */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { post, setSession, type Session } from "../../../lib/api";
import { whatsappUrl } from "../../../lib/config";
import { L } from "./content";

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

export function useDemo() {
  const navigate = useNavigate();
  const available = useDemoAvailable();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setSession(await post<Session>("/auth/demo"));
      navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { available, busy, error, start };
}

export const whatsappLink = (key = "account.whatsappText") => whatsappUrl(L(key));

/** Enlaces a Crear cuenta e Ingresar, con el mismo estilo de texto subrayado del resto de la landing. */
export function SignupLink({ className = "", label = L("account.signup") }: { className?: string; label?: string }) {
  return (
    <Link to="/ingresar" search={{ modo: "registro" }} className={`link-yvy ${className}`}>
      {label}
    </Link>
  );
}
export function LoginLink({ className = "" }: { className?: string }) {
  return (
    <Link to="/ingresar" className={`link-yvy ${className}`}>
      {L("account.login")}
    </Link>
  );
}
export function AppLink({ className = "" }: { className?: string }) {
  return (
    <a href="/descargar-app" className={`link-yvy ${className}`}>
      {L("account.app")}
    </a>
  );
}
export function WhatsappLink({ className = "", label = L("account.whatsapp"), text }: { className?: string; label?: string; text?: string }) {
  return (
    <a href={whatsappLink(text)} target="_blank" rel="noreferrer" className={`link-yvy ${className}`}>
      {label}
    </a>
  );
}
