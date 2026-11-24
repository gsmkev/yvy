import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isFieldRole, ROLES } from "@yvy/shared";
import { Button, ErrorBox, Field, Form, Input, Modal, Select, toast } from "../../components/ui";
import { post } from "../../lib/api";
import { t, tk } from "../../lib/i18n";

export function AddMember({ canAddAdmins, onClose }: { canAddAdmins: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ fullName: "", email: "", phone: "", role: "worker" });
  const add = useMutation({
    mutationFn: () =>
      post("/org/members", { fullName: f.fullName, email: f.email || null, phone: f.phone || null, role: f.role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      toast(t("ui.toastMemberAdded"));
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const roles = ROLES.filter((r) => r !== "owner" && (canAddAdmins || isFieldRole(r)));
  return (
    <Modal title={t("ui.addMember")} onClose={onClose}>
      <Form className="flex flex-col gap-3" onSubmit={() => add.mutate()}>
        <Field label={t("ui.memberName")}>
          <Input required value={f.fullName} onChange={set("fullName")} />
        </Field>
        <Field label={t("ui.role")}>
          <Select
            value={f.role}
            onChange={set("role")}
            options={roles.map((r) => ({ value: r, label: tk(`ui.role_${r}`) }))}
          />
        </Field>
        <Field label={t("ui.memberEmail")}>
          <Input type="email" required={!isFieldRole(f.role)} value={f.email} onChange={set("email")} />
        </Field>
        <Field label={t("ui.phone")}>
          <Input type="tel" value={f.phone} onChange={set("phone")} />
        </Field>
        {add.error && <ErrorBox error={add.error} />}
        <Button type="submit" variant="primary" disabled={add.isPending}>
          {t("ui.save")}
        </Button>
      </Form>
    </Modal>
  );
}
