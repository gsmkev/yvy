/** Formularios del segundo factor: alta con QR, códigos de recuperación y confirmación de baja o de códigos nuevos. */
import { QRCodeSVG } from "qrcode.react";
import { t } from "../../lib/i18n";
import { Button, ErrorBox, Field, Form, Input } from "../ui";
import type { TotpSetup, TotpState } from "./useTotp";

/** Códigos de recuperación que se muestran una sola vez. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="mt-4 border-l-2 border-trigo pl-3">
      <p className="font-medium">{t("ui.totp.recoveryTitle")}</p>
      <p className="mt-1 text-sm text-tinta-2">{t("ui.totp.recoveryText")}</p>
      <ul className="num mt-3 grid max-w-xs grid-cols-2 gap-x-6 gap-y-1 font-mono text-body">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => void navigator.clipboard?.writeText(codes.join("\n"))}>{t("ui.totp.recoveryCopy")}</Button>
        <Button variant="primary" onClick={onDone}>
          {t("ui.totp.recoverySaved")}
        </Button>
      </div>
    </div>
  );
}

/** Alta: QR para la app de autenticación y el código que confirma. */
export function SetupForm({ setup, totp }: { setup: TotpSetup; totp: TotpState }) {
  const { code, setCode, enable } = totp;
  return (
    <Form className="mt-4 flex max-w-sm flex-col gap-4" onSubmit={() => enable.mutate()}>
      <p className="text-sm">{t("ui.totp.scan")}</p>
      <div className="w-44 bg-white p-2">
        <QRCodeSVG value={setup.otpauth} size={160} marginSize={0} />
      </div>
      <p className="text-sm text-tinta-2">
        {t("ui.totp.manual")} <code className="break-all font-mono text-surco">{setup.secret}</code>
      </p>
      <Field label={t("ui.totp.confirmLabel")}>
        <Input inputMode="numeric" maxLength={6} pattern="\d{6}" required autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="num tracking-[0.3em]" />
      </Field>
      <Button type="submit" variant="primary" disabled={enable.isPending || code.length !== 6}>
        {t("ui.totp.confirm")}
      </Button>
      {enable.error ? <ErrorBox error={enable.error} /> : null}
    </Form>
  );
}

/** Pide un código para dar de baja el segundo factor o generar códigos de recuperación nuevos. */
export function ConfirmForm({ action, totp }: { action: "disable" | "regen"; totp: TotpState }) {
  const { code, setCode, disable, regen, cancel } = totp;
  const error = disable.error ?? regen.error;
  return (
    <Form className="mt-3 flex max-w-sm flex-col gap-3" onSubmit={() => (action === "disable" ? disable : regen).mutate()}>
      <Field label={t("ui.totp.askCode")}>
        <Input required autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant={action === "disable" ? "danger" : "primary"} disabled={code.trim().length < 6}>
          {t(action === "disable" ? "ui.totp.disable" : "ui.totp.regen")}
        </Button>
        <Button onClick={cancel}>{t("ui.common.cancel")}</Button>
      </div>
      {error ? <ErrorBox error={error} /> : null}
    </Form>
  );
}
