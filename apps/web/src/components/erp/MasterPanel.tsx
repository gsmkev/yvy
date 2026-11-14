/** Lista plana con alta, cambio y baja para un maestro del ERP (terceros, máquinas, depósitos...). */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fromMinor, toMinor, type Currency } from "@yvy/shared";
import { del, get, patch, post } from "../../lib/api";
import { t } from "../../lib/i18n";
import { Button, ConfirmModal, EmptyState, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../ui";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions, RowMenu } from "./adminSlot";

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "money";
  options?: { value: string; label: string }[];
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: string;
  hint?: string;
  /** Solo para `money`: campo de la fila con la moneda ("PYG" o "USD"). */
  currencyKey?: string;
  /** Valor inicial en un alta. */
  initial?: string;
}

export interface ColDef<T> {
  header: string;
  cell: (r: T) => ReactNode;
  /** Montos y cantidades: a la derecha. */
  right?: boolean;
}

export const useErpList = <T,>(path: string, enabled = true) =>
  useQuery({ enabled, queryKey: ["erp", path], queryFn: () => get<T[]>(`/org/erp/${path}`) });

type Row = { id: string };

const toForm = (fields: FieldDef[], row: Row | null): Record<string, string> =>
  Object.fromEntries(
    fields.map((f) => {
      const rec = row as Record<string, unknown> | null;
      const v = rec?.[f.key];
      if (v === null || v === undefined) return [f.key, row ? "" : (f.initial ?? "")];
      if (f.type === "money") return [f.key, String(fromMinor(Number(v), (rec?.[f.currencyKey ?? "currency"] as Currency) ?? "PYG"))];
      return [f.key, String(v)];
    }),
  );

const toBody = (fields: FieldDef[], form: Record<string, string>) =>
  Object.fromEntries(
    fields.map((f) => {
      const raw = (form[f.key] ?? "").trim();
      if (f.type === "number") return [f.key, raw === "" ? null : Number(raw)];
      if (f.type === "money") return [f.key, raw === "" ? null : toMinor(Number(raw), (form[f.currencyKey ?? "currency"] as Currency) ?? "PYG")];
      return [f.key, raw === "" ? null : raw];
    }),
  );

export function RowModal({
  title,
  fields,
  row,
  path,
  onClose,
}: {
  title: string;
  fields: FieldDef[];
  row: Row | null;
  path: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => toForm(fields, row));
  const save = useMutation({
    mutationFn: () => {
      const body = toBody(fields, form);
      return row ? patch(`/org/erp/${path}/${row.id}`, body) : post(`/org/erp/${path}`, body);
    },
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {fields.map((f, i) => {
          const set = (e: { target: { value: string } }) => setForm({ ...form, [f.key]: e.target.value });
          return (
            <div key={f.key} className={f.type === "select" || f.type === "number" || f.type === "date" || f.type === "money" ? "" : "col-span-2"}>
              <Field label={f.label} hint={f.hint}>
                {f.type === "select" ? (
                  <Select value={form[f.key] ?? ""} onChange={set} options={f.options ?? []} />
                ) : (
                  <Input
                    autoFocus={i === 0}
                    required={f.required}
                    maxLength={f.maxLength}
                    type={f.type === "money" ? "number" : (f.type ?? "text")}
                    min={f.type === "money" ? 0 : f.min}
                    max={f.max}
                    step={f.step ?? (f.type === "number" || f.type === "money" ? "any" : undefined)}
                    value={form[f.key] ?? ""}
                    onChange={set}
                  />
                )}
              </Field>
            </div>
          );
        })}
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("ui.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function MasterPanel<T extends Row>({
  path,
  inline = false,
  newLabel,
  columns,
  fields,
  name,
  canEdit = true,
  filter,
}: {
  path: string;
  /** Dentro de otra pantalla (no es la sección entera): el botón de alta va en el lugar, no en el encabezado. */
  inline?: boolean;
  newLabel: string;
  columns: ColDef<T>[];
  fields: FieldDef[];
  /** Nombre de una fila para el título y la confirmación de borrado. */
  name: (r: T) => string;
  canEdit?: boolean;
  filter?: (r: T) => boolean;
}) {
  const q = useErpList<T>(path);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [removing, setRemoving] = useState<T | null>(null);
  const remove = useMutation({
    mutationFn: (r: T) => del(`/org/erp/${path}/${r.id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = (q.data ?? []).filter((r) => !filter || filter(r));
  return (
    <div className="flex flex-col gap-4">
      {canEdit &&
        (inline ? (
          <div>
            <Button onClick={() => setEditing("new")}>{newLabel}</Button>
          </div>
        ) : (
          <HeaderActions>
            <Button variant="primary" onClick={() => setEditing("new")}>
              {newLabel}
            </Button>
          </HeaderActions>
        ))}
      {rows.length === 0 ? (
        <EmptyState title={t("ui.erpEmpty")} />
      ) : (
        <div className="overflow-x-auto">
          <ExportableTable name="maestro">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-tinta-2">
                  {columns.map((c) => (
                    <th key={c.header} className={`py-2 pr-4 font-medium ${c.right ? "text-right" : ""}`}>
                      {c.header}
                    </th>
                  ))}
                  {canEdit && (
                    <th className="sticky right-0 w-12 bg-lino">
                      <span className="sr-only">{t("ui.rowActionsHeader")}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-linea">
                    {columns.map((c) => (
                      <td key={c.header} className={`py-2.5 pr-4 ${c.right ? "num text-right" : ""}`}>
                        {c.cell(r)}
                      </td>
                    ))}
                    {canEdit && (
                      <td className="sticky right-0 w-12 bg-lino py-1 text-right">
                        <RowMenu name={name(r)} onEdit={() => setEditing(r)} onDelete={() => setRemoving(r)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
        </div>
      )}
      {editing && (
        <RowModal
          title={editing === "new" ? newLabel : name(editing)}
          fields={fields}
          row={editing === "new" ? null : editing}
          path={path}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          title={name(removing)}
          message={t("ui.erpDeleteConfirm", { name: name(removing) })}
          confirmLabel={t("ui.delete")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
