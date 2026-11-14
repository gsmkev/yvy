import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { get, post, put, getSession, setSession, type Session } from "../lib/api";
import { t } from "../lib/i18n";
import { Button, ErrorBox, Field, Input, Skeleton, toast } from "./ui";

interface Status {
  enabled: boolean;
  recoveryLeft: number;
  requiredByOrg: boolean;
}

/** Tras activar el segundo factor la sesión se renueva: ya no tiene la marca de "falta darlo de alta". */
async function refreshSession() {
  const cur = getSession();
  if (!cur) return;
  setSession(await post<Session>("/auth/refresh", { refreshToken: cur.refreshToken }));
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="mt-4 border-l-2 border-trigo pl-3">
      <p className="font-medium">{t("ui.totpRecoveryTitle")}</p>
      <p className="mt-1 text-sm text-tinta-2">{t("ui.totpRecoveryText")}</p>
      <ul className="num mt-3 grid max-w-xs grid-cols-2 gap-x-6 gap-y-1 font-mono text-[15px]">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => void navigator.clipboard?.writeText(codes.join("\n"))}>{t("ui.totpRecoveryCopy")}</Button>
        <Button variant="primary" onClick={onDone}>
          {t("ui.totpRecoverySaved")}
        </Button>
      </div>
    </div>
  );
}

/**
 * P-08: segundo factor propio. Alta con QR (otpauth://), códigos de recuperación y baja. Con `forced` (el dueño lo exige
 * a los administradores) no hay baja y es lo único que se ve hasta completar el alta.
 */
export function TotpSection({ forced = false }: { forced?: boolean }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["totp"], queryFn: () => get<Status>("/auth/totp") });
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState("");
  const [fresh, setFresh] = useState<string[] | null>(null);
  const [action, setAction] = useState<"disable" | "regen" | null>(null);
  const done = () => {
    setSetup(null);
    setCode("");
    setAction(null);
    void qc.invalidateQueries({ queryKey: ["totp"] });
  };
  const start = useMutation({ mutationFn: () => post<{ secret: string; otpauth: string }>("/auth/totp/setup"), onSuccess: setSetup });
  const enable = useMutation({
    mutationFn: () => post<{ recoveryCodes: string[] }>("/auth/totp/enable", { code }),
    onSuccess: async (r) => {
      setFresh(r.recoveryCodes);
      done();
      toast(t("ui.toastTotpOn"));
      await refreshSession();
    },
  });
  const disable = useMutation({ mutationFn: () => post("/auth/totp/disable", { code }),
    onSuccess: () => {
      done();
      toast(t("ui.toastTotpOff"));
    },
  });
  const regen = useMutation({
    mutationFn: () => post<{ recoveryCodes: string[] }>("/auth/totp/recovery-codes", { code }),
    onSuccess: (r) => {
      setFresh(r.recoveryCodes);
      done();
      toast(t("ui.toastTotpCodes"));
    },
  });
  const s = status.data;
  if (!s) return <Skeleton h={168} />;
  const lockedByOrg = forced || s.requiredByOrg;

  return (
    <section id="segundo-factor" className="scroll-mt-4">
      <h2 className="text-[18px] leading-6 font-semibold">{t("ui.totpTitle")}</h2>
      <p className="mt-2 text-tinta-2">{t(lockedByOrg ? "ui.totpIntroRequired" : "ui.totpIntro")}</p>

      {fresh && <RecoveryCodes codes={fresh} onDone={() => setFresh(null)} />}

      {!fresh && !s.enabled && !setup && (
        <Button variant="primary" className="mt-4" disabled={start.isPending} onClick={() => start.mutate()}>
          {t("ui.totpActivate")}
        </Button>
      )}

      {!s.enabled && setup && (
        <form
          className="mt-4 flex max-w-sm flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            enable.mutate();
          }}
        >
          <p className="text-sm">{t("ui.totpScan")}</p>
          <div className="w-44 bg-white p-2">
            <QRCodeSVG value={setup.otpauth} size={160} marginSize={0} />
          </div>
          <p className="text-sm text-tinta-2">
            {t("ui.totpManual")} <code className="break-all font-mono text-surco">{setup.secret}</code>
          </p>
          <Field label={t("ui.totpConfirmLabel")}>
            <Input
              inputMode="numeric"
              maxLength={6}
              pattern="\d{6}"
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="num tracking-[0.3em]"
            />
          </Field>
          <Button type="submit" variant="primary" disabled={enable.isPending || code.length !== 6}>
            {t("ui.totpConfirm")}
          </Button>
          {enable.error ? <ErrorBox error={enable.error} /> : null}
        </form>
      )}

      {s.enabled && !fresh && (
        <div className="mt-4">
          <p role="status" className="border-l-2 border-soja pl-3">
            {t("ui.totpOn", { n: s.recoveryLeft })}
          </p>
          {action ? (
            <form
              className="mt-3 flex max-w-sm flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                (action === "disable" ? disable : regen).mutate();
              }}
            >
              <Field label={t("ui.totpAskCode")}>
                <Input required autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant={action === "disable" ? "danger" : "primary"} disabled={code.trim().length < 6}>
                  {t(action === "disable" ? "ui.totpDisable" : "ui.totpRegen")}
                </Button>
                <Button onClick={() => (setAction(null), setCode(""))}>{t("ui.cancel")}</Button>
              </div>
              {(disable.error ?? regen.error) ? <ErrorBox error={disable.error ?? regen.error} /> : null}
            </form>
          ) : (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <button type="button" className="cursor-pointer font-medium text-accion underline underline-offset-4" onClick={() => setAction("regen")}>
                {t("ui.totpRegen")}
              </button>
              {!lockedByOrg && (
                <button type="button" className="cursor-pointer font-medium text-peligro underline underline-offset-4" onClick={() => setAction("disable")}>
                  {t("ui.totpDisable")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface Security {
  requireAdminTotp: boolean;
  admins: { userId: string; fullName: string; totp: boolean }[];
}

/** P-08: el dueño exige el segundo factor a los administradores y ve quién ya lo activó. */
export function AdminTotpPolicy() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["org-security"], queryFn: () => get<Security>("/org/security") });
  const set = useMutation({
    mutationFn: (v: boolean) => put("/org/security", { requireAdminTotp: v }),
    onSuccess: () => {
      toast(t("ui.toastTotpPolicy"));
      return qc.invalidateQueries({ queryKey: ["org-security"] });
    },
  });
  if (!q.data) return <Skeleton h={64} />;
  return (
    <section>
      <h2 className="text-[18px] leading-6 font-semibold">{t("ui.totpPolicyTitle")}</h2>
      <label className="mt-2 flex cursor-pointer items-start gap-2 text-[15px]">
        <input
          type="checkbox"
          className="mt-1 accent-accion"
          checked={q.data.requireAdminTotp}
          disabled={set.isPending}
          onChange={(e) => set.mutate(e.target.checked)}
        />
        <span>{t("ui.totpPolicyLabel")}</span>
      </label>
      {q.data.admins.length === 0 ? (
        <p className="mt-2 text-sm text-tinta-2">{t("ui.totpPolicyNoAdmins")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-linea border-y border-linea text-sm">
          {q.data.admins.map((a) => (
            <li key={a.userId} className="flex justify-between gap-3 py-2">
              <span>{a.fullName}</span>
              <span className={a.totp ? "text-soja" : "text-tinta-2"}>{t(a.totp ? "ui.totpPolicyOn" : "ui.totpPolicyOff")}</span>
            </li>
          ))}
        </ul>
      )}
      {set.error ? <ErrorBox error={set.error} /> : null}
    </section>
  );
}
