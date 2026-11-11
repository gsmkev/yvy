import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ConfirmModal, Spinner } from "../../components/ui";
import { post } from "../../lib/api";
import { t } from "../../lib/i18n";
import { useMe } from "../../lib/queries";

/** Cuenta (solo dueño): por ahora, el pedido de baja (P-09). No borra nada. */
export function AccountPage() {
  const me = useMe();
  const [confirming, setConfirming] = useState(false);
  const request = useMutation({
    mutationFn: () => post("/org/delete-request"),
    onSuccess: () => setConfirming(false),
  });

  if (me.isLoading)
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <h1 className="text-[28px] leading-tight">{t("ui.accountTitle")}</h1>
      {me.data?.role !== "owner" ? (
        <p className="mt-4 text-tinta-2">{t("ui.accountOwnerOnly")}</p>
      ) : (
        <section className="mt-8">
          <h2 className="font-serif text-xl font-semibold">{t("ui.accountDeleteTitle")}</h2>
          <p className="mt-2 text-tinta-2">{t("ui.accountDeleteText")}</p>
          {request.isSuccess ? (
            <p role="status" className="mt-4 border-l-2 border-soja pl-3">
              {t("ui.accountDeleteSent")}
            </p>
          ) : (
            <button
              type="button"
              className="mt-4 cursor-pointer text-sm font-medium text-peligro underline underline-offset-4 hover:text-alerta"
              onClick={() => setConfirming(true)}
            >
              {t("ui.accountDeleteButton")}
            </button>
          )}
        </section>
      )}
      {confirming && (
        <ConfirmModal
          title={t("ui.accountDeleteConfirmTitle")}
          message={t("ui.accountDeleteConfirmText")}
          confirmLabel={t("ui.accountDeleteConfirmButton")}
          pending={request.isPending}
          error={request.error}
          onConfirm={() => request.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
