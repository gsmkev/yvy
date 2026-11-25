import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorBox, Field, Form, Input, Modal, toast, FormFooter } from "../../components/ui";
import { del, put } from "../../lib/api";
import { t } from "../../lib/i18n";
import type { Member } from "../../lib/types";

/** El dueño o administrador da o cambia el PIN de ingreso de un empleado (alternativa al QR). */
export function PinDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(member.phone ?? "");
  const [own, setOwn] = useState(false);
  const [pin, setPin] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => put<{ pin?: string }>(`/org/members/${member.userId}/pin`, { phone, ...(own ? { pin } : {}) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["members"] });
      if (r.pin) setShown(r.pin);
      else {
        toast(t("app.team.pinSaved"));
        onClose();
      }
    },
  });
  const clear = useMutation({
    mutationFn: () => del(`/org/members/${member.userId}/pin`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      onClose();
    },
  });
  return (
    <Modal title={`${t("app.team.pinTitle")}: ${member.fullName}`} onClose={onClose}>
      {shown ? (
        <div className="flex flex-col gap-4">
          <p className="num text-center text-4xl font-semibold tracking-[0.3em]">{shown}</p>
          <p className="text-sm text-tinta-2">{t("app.team.pinShow", { name: member.fullName, pin: shown })}</p>
          <Button variant="primary" onClick={onClose}>
            {t("ui.common.close")}
          </Button>
        </div>
      ) : (
        <Form className="flex flex-col gap-3" onSubmit={() => save.mutate()}>
          <Field label={t("app.team.pinPhoneLabel")}>
            <Input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
            {t("app.team.pinOwn")}
          </label>
          {own && (
            <Field label={t("app.login.pinLabel")}>
              <Input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </Field>
          )}
          {!own && <p className="text-sm text-tinta-2">{t("app.team.pinGenerate")}</p>}
          {(save.error || clear.error) && <ErrorBox error={save.error ?? clear.error} />}
          <FormFooter error={null} disabled={save.isPending || (own && pin.length !== 6)} label={t("ui.common.save")} />
{member.hasPin && (
            <Button variant="danger" disabled={clear.isPending} onClick={() => clear.mutate()}>
              {t("app.team.pinRemove")}
            </Button>
          )}
        </Form>
      )}
    </Modal>
  );
}
