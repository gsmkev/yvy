import { useState, type ReactNode } from "react";
import { Button } from "../../components/ui";
import { t } from "../../lib/i18n";
import { ExportableTable } from "../../components/ExportableTable";

/** Número en es-PY con la cantidad de decimales indicada. */
export const nf = (n: number, digits = 0) =>
  n.toLocaleString("es-PY", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Zona de carga simulada: no hay input de archivo y no se envía nada. */
function DropZone() {
  return (
    <div className="flex flex-col items-start gap-2 border border-dashed border-linea px-4 py-6">
      <Button disabled>{t("ui.labs.pickFile")}</Button>
      <p className="text-sm text-tinta-2">{t("ui.labs.pickFileHelp")}</p>
    </div>
  );
}

/** Pasos comunes: carga simulada, botón del ejemplo y el resultado ilustrativo. */
export function Flow({ drop = true, children }: { drop?: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {drop && <DropZone />}
      <div>
        <Button variant="primary" onClick={() => setShown((v) => !v)} aria-expanded={shown}>
          {shown ? t("ui.labs.hideExample") : t("ui.labs.showExample")}
        </Button>
      </div>
      {shown && (
        <section className="flex flex-col gap-4">
          <h2 className="text-section leading-6 font-semibold">{t("ui.labs.exampleTitle")}</h2>
          {children}
        </section>
      )}
    </div>
  );
}

/** Muestra de color con su texto. */
export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-tinta-2">
      <span className="inline-block h-2.5 w-2.5 border" style={{ borderColor: color }} aria-hidden />
      {label}
    </p>
  );
}

/** Cifra grande con su etiqueta. */
export function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-b border-linea pb-3">
      <div className="num font-serif text-5xl leading-none font-semibold">{value}</div>
      <div className="mt-1 text-sm text-tinta-2">{label}</div>
    </div>
  );
}

/** Tabla de ejemplo con encabezados y filas de texto. */
export function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <ExportableTable name="laboratorio">
      <table className="num w-full text-sm">
        <thead>
          <tr className="border-b border-linea text-left text-tinta-2">
            {head.map((h, i) => (
              <th key={h} className={`py-2 font-medium ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-linea">
              {r.map((c, i) => (
                <td key={i} className={`py-2 ${i > 0 ? "text-right" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ExportableTable>
  );
}
