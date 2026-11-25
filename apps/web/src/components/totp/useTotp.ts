/** Estado y acciones del segundo factor propio: alta, baja y códigos de recuperación. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, getSession, post, setSession, type Session } from "../../lib/api";
import { t } from "../../lib/i18n";
import { toast } from "../ui";

/** Si el segundo factor está activo, cuántos códigos de recuperación quedan y si la organización lo exige. */
export interface TotpStatus {
  enabled: boolean;
  recoveryLeft: number;
  requiredByOrg: boolean;
}

/** Datos para dar de alta el segundo factor: secreto y enlace para el QR. */
export interface TotpSetup {
  secret: string;
  otpauth: string;
}

/** Acción que pide confirmar con un código. */
type TotpAction = "disable" | "regen";

/** Tras activar el segundo factor la sesión se renueva: ya no tiene la marca de "falta darlo de alta". */
async function refreshSession() {
  const cur = getSession();
  if (!cur) return;
  setSession(await post<Session>("/auth/refresh", { refreshToken: cur.refreshToken }));
}

/** Todo lo que necesita la sección: estado, código que se escribe y las mutaciones. */
export function useTotp() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["totp"], queryFn: () => get<TotpStatus>("/auth/totp") });
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [fresh, setFresh] = useState<string[] | null>(null);
  const [action, setAction] = useState<TotpAction | null>(null);
  const done = () => {
    setSetup(null);
    setCode("");
    setAction(null);
    void qc.invalidateQueries({ queryKey: ["totp"] });
  };
  const start = useMutation({ mutationFn: () => post<TotpSetup>("/auth/totp/setup"), onSuccess: setSetup });
  const enable = useMutation({
    mutationFn: () => post<{ recoveryCodes: string[] }>("/auth/totp/enable", { code }),
    onSuccess: async (r) => {
      setFresh(r.recoveryCodes);
      done();
      toast(t("ui.toast.totpOn"));
      await refreshSession();
    },
  });
  const disable = useMutation({
    mutationFn: () => post("/auth/totp/disable", { code }),
    onSuccess: () => {
      done();
      toast(t("ui.toast.totpOff"));
    },
  });
  const regen = useMutation({
    mutationFn: () => post<{ recoveryCodes: string[] }>("/auth/totp/recovery-codes", { code }),
    onSuccess: (r) => {
      setFresh(r.recoveryCodes);
      done();
      toast(t("ui.toast.totpCodes"));
    },
  });
  const cancel = () => {
    setAction(null);
    setCode("");
  };
  return { status: status.data, setup, code, setCode, fresh, setFresh, action, setAction, cancel, start, enable, disable, regen };
}

/** Estado del segundo factor con sus acciones. */
export type TotpState = ReturnType<typeof useTotp>;
