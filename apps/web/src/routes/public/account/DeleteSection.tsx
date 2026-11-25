/** Pedido de baja de la organización (solo dueño): no borra nada, avisa al equipo. */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, ConfirmModal, SectionHead, toast } from "../../../components/ui";
import { post } from "../../../lib/api";
import { t } from "../../../lib/i18n";

/** Explica la baja y pide confirmación antes de mandar el pedido. */
export function DeleteSection() {
  const [confirming, setConfirming] = useState(false);
  const request = useMutation({
    mutationFn: () => post("/org/delete-request"),
    onSuccess: () => {
      setConfirming(false);
      toast(t("ui.toast.deleteRequested"));
    },
  });
  return (
    <section>
      <SectionHead title={t("ui.account.deleteTitle")} />
      <p className="mt-3 text-tinta-2">{t("ui.account.deleteText")}</p>
      {request.isSuccess ? (
        <p role="status" className="mt-4 border-l-2 border-soja pl-3">
          {t("ui.account.deleteSent")}
        </p>
      ) : (
        <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>
          {t("ui.account.deleteButton")}
        </Button>
      )}
      {confirming && (
        <ConfirmModal
          title={t("ui.account.deleteConfirmTitle")}
          message={t("ui.account.deleteConfirmText")}
          confirmLabel={t("ui.account.deleteConfirmButton")}
          pending={request.isPending}
          error={request.error}
          onConfirm={() => request.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
