/** Lista plana con alta, cambio y baja para un maestro del ERP (terceros, máquinas, depósitos...). */
import { t } from "../../lib/i18n";
import { Button, DataTable, EmptyState, ErrorBox, Spinner } from "../ui";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions, useTableExport } from "./adminSlot";
import { useErpList, type ColDef, type FieldDef, type Row } from "./RowModal";
import { useRowCrud } from "./useRowCrud";

/** Props de MasterPanel; `path` es la ruta del maestro bajo /org/erp. */
interface MasterPanelProps<T> {
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
}

/** Panel completo de un maestro: tabla, alta, edición, baja y exportación. */
export function MasterPanel<T extends Row>({ path, inline = false, newLabel, columns, fields, name, canEdit = true, filter, empty, exportName }: MasterPanelProps<T>) {
  const q = useErpList<T>(path);
  const exp = useTableExport(exportName ?? "maestro");
  const crud = useRowCrud<T>({ path, fields, name, newLabel, canEdit });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = (q.data ?? []).filter((r) => !filter || filter(r));
  const table = <DataTable columns={crud.columns(columns)} rows={rows} rowKey={(r) => r.id} />;
  const addHere = canEdit && !(empty && rows.length === 0 && !inline);
  return (
    <div className="flex flex-col gap-4">
      {addHere &&
        (inline ? (
          <div>
            <Button onClick={crud.openNew}>{newLabel}</Button>
          </div>
        ) : (
          <HeaderActions>
            <Button variant="primary" onClick={crud.openNew}>
              {newLabel}
            </Button>
          </HeaderActions>
        ))}
      {rows.length === 0 ? (
        <EmptyState
          title={empty?.title ?? t("ui.erp.empty")}
          action={empty && canEdit ? <Button variant="primary" onClick={crud.openNew}>{newLabel}</Button> : undefined}
        >
          {empty?.body}
        </EmptyState>
      ) : exportName && !inline ? (
        <>
          {exp.menu}
          <div ref={exp.ref}>{table}</div>
        </>
      ) : (
        <ExportableTable name="maestro">{table}</ExportableTable>
      )}
      {crud.dialogs}
    </div>
  );
}
