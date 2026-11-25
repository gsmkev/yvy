/**
 * Lista plana de un maestro del ERP con alta, cambio y baja, en la plantilla de Administración:
 * tabla (`DataTable`) y, si no hay nada, un vacío con el botón de alta. Usa los campos y el modal de `RowModal`.
 */
import type { ReactNode } from "react";
import { t } from "../../lib/i18n";
import { Button, DataTable, EmptyState, ErrorBox, Spinner } from "../ui";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions } from "./adminSlot";
import { useErpList, type ColDef, type FieldDef, type Row } from "./RowModal";
import { useRowCrud } from "./useRowCrud";

/** Props de RecordList; `path` es la ruta del maestro en la API. */
interface RecordListProps<T> {
  path: string;
  /** Dentro de otro panel: el botón de alta va en el lugar y no en el encabezado. */
  inline?: boolean;
  /** Texto del botón de alta. */
  newLabel: string;
  /** Columnas de la tabla. */
  columns: ColDef<T>[];
  /** Campos del formulario. */
  fields: FieldDef[];
  /** Nombre de una fila para el título y la confirmación de borrado. */
  name: (r: T) => string;
  /** Qué falta, en una frase. */
  emptyTitle?: string;
  /** Para qué sirve, en una frase. */
  emptyHint?: ReactNode;
  /** Base del nombre del archivo exportado. */
  exportName?: string;
}

/** Tabla de un maestro con alta, cambio y baja. */
export function RecordList<T extends Row>({ path, inline = false, newLabel, columns, fields, name, emptyTitle, emptyHint, exportName = "lista" }: RecordListProps<T>) {
  const q = useErpList<T>(path);
  const crud = useRowCrud<T>({ path, fields, name, newLabel });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = q.data ?? [];
  const add = (
    <Button variant={inline && rows.length > 0 ? "secondary" : "primary"} onClick={crud.openNew}>
      {newLabel}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (inline ? <div>{add}</div> : <HeaderActions>{add}</HeaderActions>)}
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle ?? t("ui.erp.empty")} action={add}>
          {emptyHint}
        </EmptyState>
      ) : (
        <ExportableTable name={exportName}>
          <DataTable columns={crud.columns(columns)} rows={rows} rowKey={(r) => r.id} />
        </ExportableTable>
      )}
      {crud.dialogs}
    </div>
  );
}
