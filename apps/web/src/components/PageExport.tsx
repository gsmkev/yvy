/** Un solo "Exportar" por pantalla: junta las tablas que se ven dentro de `root` en un Excel (una hoja por tabla) o en un CSV si hay una. */
import type { RefObject } from "react";
import { t } from "../lib/i18n";
import { tableFromElement, tableToCsv, tablesToExcel, type TableData } from "../lib/tableExport";
import { ExportMenu } from "./menus";

/**
 * Botón "Exportar" de la pantalla.
 * @param root contenedor cuyas tablas se exportan.
 */
export function PageExport({ root, name }: { root: RefObject<HTMLElement | null>; /** Base del nombre de archivo y de las hojas. */ name: string }) {
  const tables = (): TableData[] => {
    const all = [...(root.current?.querySelectorAll("table") ?? [])];
    return all.map((el, i) => tableFromElement(el, el.caption?.textContent?.trim() || (all.length > 1 ? `${name} ${i + 1}` : name)));
  };
  return (
    <ExportMenu
      formats={[
        { label: t("ui.export.formatExcel"), run: () => tablesToExcel(name, tables()) },
        { label: t("ui.export.formatCsv"), run: () => tables().forEach((d) => tableToCsv(d)) },
      ]}
    />
  );
}
