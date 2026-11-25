/** Estado y guardado del alta y edición de clientes y proveedores por REST. */
import { useState } from "react";
import { PARTY_KINDS, partyInput, t } from "@yvy/shared";
import { showToast } from "../../lib/toast";
import type { Party } from "../adminKit";
import { useOnlineMutation } from "../useOnlineMutation";

/** Tipo de contraparte: proveedor, cliente o ambos. */
export type Kind = (typeof PARTY_KINDS)[number];

/** Campos del formulario de contraparte como texto. */
interface Draft {
  id: string | null;
  name: string;
  ruc: string;
  kind: Kind;
  phone: string;
  email: string;
  address: string;
  note: string;
}

const blank: Draft = { id: null, name: "", ruc: "", kind: "supplier", phone: "", email: "", address: "", note: "" };

const draftOf = (p: Party): Draft => ({ id: p.id, name: p.name, ruc: p.ruc ?? "", kind: p.kind, phone: p.phone ?? "", email: p.email ?? "", address: p.address ?? "", note: p.note ?? "" });

/** Cuerpo del POST o PATCH, o el texto del error si falta el nombre o algún campo no pasa la validación. */
function bodyOf(d: Draft): Record<string, unknown> | { error: string } {
  const body = { name: d.name.trim(), ruc: d.ruc.trim() || null, kind: d.kind, phone: d.phone.trim() || null, email: d.email.trim() || null, address: d.address.trim() || null, note: d.note.trim() || null };
  if (!body.name) return { error: t("office.adm.partyNeedsName") };
  const check = partyInput.safeParse(body);
  if (!check.success) return { error: check.error.issues[0]?.path[0] === "ruc" ? t("ui.party.rucHint") : t("office.adm.checkFields") };
  return body;
}

/** Edición de contrapartes: borrador abierto, guardado y errores. */
export function usePartyEditor() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/erp/parties", { invalidate: ["/org/erp"] });
  const edit = useOnlineMutation<Record<string, unknown> & { id: string }, { ok: boolean }>("PATCH", (b) => `/org/erp/parties/${b.id}`, { invalidate: ["/org/erp"] });

  const open = (p: Party | null) => {
    setFormError(null);
    create.reset();
    edit.reset();
    setDraft(p ? draftOf(p) : { ...blank });
  };
  const submit = async () => {
    if (!draft) return;
    const body = bodyOf(draft);
    if ("error" in body) return setFormError(body.error as string);
    setFormError(null);
    const r = draft.id ? await edit.mutate({ id: draft.id, ...body }) : await create.mutate(body);
    if (!r.ok) return;
    setDraft(null);
    showToast(t("ui.erp.saved"));
  };

  return {
    draft,
    open,
    submit,
    close: () => setDraft(null),
    set: (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d)),
    pending: create.pending || edit.pending,
    error: formError ?? (draft?.id ? edit.error : create.error),
  };
}

/** Editor de contrapartes. */
export type PartyEditor = ReturnType<typeof usePartyEditor>;
