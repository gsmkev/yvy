import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, ConfirmModal, toast } from "../../components/ui";
import { post } from "../../lib/api";
import { t } from "../../lib/i18n";

/** Botón del panel interno que manda al email de quien lo toca una muestra de cada plantilla de correo. */
export function EmailSamples() {
  const [open, setOpen] = useState(false);
  const send = useMutation({
    mutationFn: () => post<{ sent: number }>("/admin/email-samples"),
    onSuccess: (r) => {
      setOpen(false);
      toast(t("email.samples.sent", { n: r.sent }));
    },
  });
  return (
    <section>
      <Button onClick={() => setOpen(true)}>{t("email.samples.button")}</Button>
      {open && (
        <ConfirmModal
          title={t("email.samples.title")}
          message={t("email.samples.message")}
          confirmLabel={t("email.samples.confirm")}
          pending={send.isPending}
          error={send.error}
          onConfirm={() => send.mutate()}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
