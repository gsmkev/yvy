import { t } from "../lib/i18n";
import { tableToCsv, tableToExcel, type TableData } from "../lib/tableExport";
import { ExportMenu } from "./menus";

/** Un solo botón "Exportar" con Excel y CSV de la tabla que se está viendo. `data` se arma al exportar. */
export function TableExportMenu({ data, className }: { data: () => TableData; className?: string }) {
  return (
    <ExportMenu
      quiet
      className={className}
      formats={[
        { label: t("ui.exportFormatExcel"), run: () => tableToExcel(data()) },
        { label: t("ui.exportFormatCsv"), run: () => tableToCsv(data()) },
      ]}
    />
  );
}
