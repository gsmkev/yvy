import { useState } from "react";
import { t } from "../lib/i18n";
import { tableToCsv, tableToExcel, type TableData } from "../lib/tableExport";
import { Button, toast } from "./ui";

/** Dos botones de texto: Excel y CSV de la tabla que se está viendo. `data` se arma al exportar. */
export function ExportButtons({ data }: { data: () => TableData }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: (d: TableData) => unknown) => {
    setBusy(true);
    try {
      await fn(data());
    } catch (e) {
      toast(t("ui.error", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex gap-1">
      <Button variant="quiet" disabled={busy} onClick={() => run(tableToExcel)}>
        {t("ui.exportExcel")}
      </Button>
      <Button variant="quiet" disabled={busy} onClick={() => run(tableToCsv)}>
        {t("ui.exportCsv")}
      </Button>
    </span>
  );
}
