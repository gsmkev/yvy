/** Lista plana con alta, cambio y baja para un maestro del ERP (terceros, máquinas, depósitos...). */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fromMinor, toMinor, type Currency } from "@yvy/shared";
import { del, get, patch, post } from "../../lib/api";
import { t } from "../../lib/i18n";
import { Button, type Column, ConfirmModal, DataTable, EmptyState, ErrorBox, Field, Form, FormFooter, Input, Modal, Select, Spinner, toast } from "../ui";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions, RowMenu, useTableExport } from "./adminSlot";

/** Campo del formulario de un maestro. `type` "money" convierte a la unidad menor de la moneda indicada por `currencyKey`. */
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

/** Columna de la tabla de un maestro; `right` alinea a la derecha los montos y las cantidades. */
export interface ColDef<T> {
  header: string;
  cell: (r: T) => ReactNode;
  /** Montos y cantidades: a la derecha. */
  right?: boolean;
  /** Oculta la columna bajo ese punto de corte (celular). */
  hideBelow?: "sm" | "md" | "lg";
}

/**
 * Lista de un recurso del ERP.
 * @param path ruta bajo /org/erp.
 * @param enabled en false evita la consulta.
 */
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

/**
 * Diálogo de alta o edición de una fila.
 * @param row fila a editar, o null para un alta.
 */
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
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={title} onClose={onClose}>
      <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
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
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}

/**
 * Panel completo de un maestro: tabla, alta, edición, baja y exportación.
 * @param path ruta del maestro en la API.
 */
export function MasterPanel<T extends Row>({
  path,
  inline = false,
  newLabel,
  columns,
  fields,
  name,
  canEdit = true,
  filter,
  empty,
  exportName,
}: {
  path: string;
  /** Dentro de otra pantalla (no es la sección entera): el botón de alta va en el lugar, no en el encabezado. */
  inline?: boolean;
  newLabel: string;
  columns: ColDef<T>[];
  fields: FieldDef[];
  /** Nombre de una fila para el título y la confirmación de borrado. */
  name: (r: T) => string;
  /** Permite alta, cambio y baja. */
canEdit?: boolean;
  /** Deja pasar solo algunas filas. */
filter?: (r: T) => boolean;
  /** Vacío propio: título y explicación; el botón de alta va en el vacío (y no en el encabezado) mientras no hay filas. */
  empty?: { title: string; body?: string };
  /** Con nombre, el "Exportar" va en el encabezado de la sección (uno solo por panel); sin él, queda junto a la tabla. */
  exportName?: string;
}) {
  const q = useErpList<T>(path);
  const exp = useTableExport(exportName ?? "maestro");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [removing, setRemoving] = useState<T | null>(null);
  const remove = useMutation({
    mutationFn: (r: T) => del(`/org/erp/${path}/${r.id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = (q.data ?? []).filter((r) => !filter || filter(r));
  const cols: Column<T>[] = [
    ...columns.map((c): Column<T> => ({ id: c.header, header: c.header, align: c.right ? "right" : "left", hideBelow: c.hideBelow, cell: c.cell })),
    ...(canEdit
      ? [
          {
            id: "actions",
            header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
            align: "right",
            width: "3rem",
            cell: (r: T) => <RowMenu name={name(r)} onEdit={() => setEditing(r)} onDelete={() => setRemoving(r)} />,
          } satisfies Column<T>,
        ]
      : []),
  ];
  const table = <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />;
  return (
    <div className="flex flex-col gap-4">
      {canEdit &&
        !(empty && rows.length === 0 && !inline) &&
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
        <EmptyState
          title={empty?.title ?? t("ui.erp.empty")}
          action={empty && canEdit ? <Button variant="primary" onClick={() => setEditing("new")}>{newLabel}</Button> : undefined}
        >
          {empty?.body}
        </EmptyState>
      ) : (
        <>
          {exportName && !inline ? (
            <>
              {exp.menu}
              <div ref={exp.ref}>{table}</div>
            </>
          ) : (
            <ExportableTable name="maestro">{table}</ExportableTable>
          )}
        </>
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
          message={t("ui.erp.deleteConfirm", { name: name(removing) })}
          confirmLabel={t("ui.common.delete")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
