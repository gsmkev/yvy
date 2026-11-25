/** Edición y baja de filas de un maestro: estado, columna de acciones y diálogos, compartido por MasterPanel y RecordList. */
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { del } from "../../lib/api";
import { t } from "../../lib/i18n";
import { ConfirmModal, toast, type Column } from "../ui";
import { RowMenu } from "./adminSlot";
import { RowModal, type ColDef, type FieldDef, type Row } from "./RowModal";

/** Qué maestro se edita y cómo se llama cada fila. */
export interface RowCrudOptions<T> {
  path: string;
  fields: FieldDef[];
  /** Nombre de una fila para el título y la confirmación de borrado. */
  name: (r: T) => string;
  /** Texto del botón de alta, que también titula el diálogo de un alta. */
  newLabel: string;
  /** En false no hay columna de acciones. */
  canEdit?: boolean;
}

/** Estado de edición y baja; `dialogs` va una sola vez en la pantalla y `columns` arma la tabla con su menú de fila. */
export function useRowCrud<T extends Row>({ path, fields, name, newLabel, canEdit = true }: RowCrudOptions<T>) {
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
  const columns = (defs: ColDef<T>[]): Column<T>[] => {
    const cols = defs.map((c): Column<T> => ({ id: c.header, header: c.header, align: c.right ? "right" : "left", hideBelow: c.hideBelow, mobile: c.mobile, cell: c.cell }));
    if (!canEdit) return cols;
    const menu: Column<T> = {
      id: "_actions",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      width: "3rem",
      cell: (r) => <RowMenu name={name(r)} onEdit={() => setEditing(r)} onDelete={() => setRemoving(r)} />,
    };
    return [...cols, menu];
  };
  const dialogs: ReactNode = (
    <>
      {editing && <RowModal title={editing === "new" ? newLabel : name(editing)} fields={fields} row={editing === "new" ? null : editing} path={path} onClose={() => setEditing(null)} />}
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
    </>
  );
  return { openNew: () => setEditing("new"), columns, dialogs };
}
