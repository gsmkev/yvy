/**
 * Lista plana de un maestro del ERP con alta, cambio y baja, en la plantilla de Administración:
 * tabla (`DataTable`) y, si no hay nada, un vacío con el botón de alta. Usa los campos y el modal de `MasterPanel`.
 */
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { del } from "../../lib/api";
import { t } from "../../lib/i18n";
import { Button, ConfirmModal, DataTable, EmptyState, ErrorBox, Spinner, toast, type Column } from "../ui";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions, RowMenu } from "./adminSlot";
import { RowModal, useErpList, type ColDef, type FieldDef } from "./MasterPanel";

type Row = { id: string };

export interface RecordColumn<T> extends ColDef<T> {
  hideBelow?: "sm" | "md" | "lg";
}

export function RecordList<T extends Row>({
  path,
  inline = false,
  newLabel,
  columns,
  fields,
  name,
  emptyTitle,
  emptyHint,
  exportName = "lista",
}: {
  path: string;
  /** Dentro de otro panel: el botón de alta va en el lugar y no en el encabezado. */
  inline?: boolean;
  newLabel: string;
  columns: RecordColumn<T>[];
  fields: FieldDef[];
  name: (r: T) => string;
  /** Qué falta, en una frase. */
  emptyTitle?: string;
  /** Para qué sirve, en una frase. */
  emptyHint?: ReactNode;
  exportName?: string;
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
  const rows = q.data ?? [];
  const add = (
    <Button variant={inline && rows.length > 0 ? "secondary" : "primary"} onClick={() => setEditing("new")}>
      {newLabel}
    </Button>
  );
  const cols: Column<T>[] = [
    ...columns.map((c) => ({ id: c.header, header: c.header, align: c.right ? ("right" as const) : ("left" as const), hideBelow: c.hideBelow, cell: c.cell })),
    {
      id: "_actions",
      header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>,
      align: "right" as const,
      width: "3rem",
      cell: (r: T) => <RowMenu name={name(r)} onEdit={() => setEditing(r)} onDelete={() => setRemoving(r)} />,
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (inline ? <div>{add}</div> : <HeaderActions>{add}</HeaderActions>)}
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle ?? t("ui.erpEmpty")} action={add}>
          {emptyHint}
        </EmptyState>
      ) : (
        <ExportableTable name={exportName}>
          <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />
        </ExportableTable>
      )}
      {editing && (
        <RowModal title={editing === "new" ? newLabel : name(editing)} fields={fields} row={editing === "new" ? null : editing} path={path} onClose={() => setEditing(null)} />
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
