import { useState } from "react";
import { localDate, type PayrollRow } from "@yvy/shared";
import { get, withQs } from "../../../lib/api";
import { t } from "../../../lib/i18n";
import { tablesToExcel } from "../../../lib/tableExport";
import { Button, ErrorBox, Field, FilterBar, Input } from "../../ui";

const monthStart = (back: number) => {
  const d = new Date(Date.now() - 3 * 3_600_000);
  return localDate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
};

/** Planilla para el contador (E-27): Excel con jornales, adelantos y pagos por empleado y mes. Sin aportes. */
export function PayrollExport() {
  const [from, setFrom] = useState(monthStart(2));
  const [to, setTo] = useState(localDate(Date.now()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [empty, setEmpty] = useState(false);
  const download = async () => {
    setBusy(true);
    setError(null);
    setEmpty(false);
    try {
      const rows = await get<PayrollRow[]>(withQs("/org/erp/employees/payroll", { from, to }));
      if (rows.length === 0) return setEmpty(true);
      const headers = [t("ui.pay.month"), t("ui.staff.name"), t("ui.staff.ci"), t("ui.bal.days"), t("ui.bal.accrued"), t("ui.bal.advances"), t("ui.bal.payments"), t("ui.pay.monthBalance")];
      const line = (r: PayrollRow) => [r.month, r.name, r.ci ?? "", r.days, r.accruedPyg, r.advancesPyg, r.paymentsPyg, r.balancePyg];
      const totals = new Map<string, PayrollRow>();
      for (const r of rows) {
        const x = totals.get(r.employeeId) ?? { ...r, month: "", days: 0, accruedPyg: 0, advancesPyg: 0, paymentsPyg: 0, balancePyg: 0 };
        x.days += r.days;
        x.accruedPyg += r.accruedPyg;
        x.advancesPyg += r.advancesPyg;
        x.paymentsPyg += r.paymentsPyg;
        x.balancePyg += r.balancePyg;
        totals.set(r.employeeId, x);
      }
      const sum = (k: "days" | "accruedPyg" | "advancesPyg" | "paymentsPyg" | "balancePyg") => rows.reduce((a, r) => a + r[k], 0);
      await tablesToExcel(`planilla-${from.slice(0, 7)}_${to.slice(0, 7)}`, [
        {
          name: t("ui.pay.sheetMonthly"),
          headers,
          rows: [...rows.map(line), [], [t("ui.pay.total"), "", "", sum("days"), sum("accruedPyg"), sum("advancesPyg"), sum("paymentsPyg"), sum("balancePyg")], [], [t("ui.pay.noContributions")]],
        },
        {
          name: t("ui.pay.sheetByEmployee"),
          headers: headers.slice(1),
          rows: [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, "es")).map((r) => line(r).slice(1)),
        },
      ]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <Field label={t("ui.acct.from")}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t("ui.acct.to")}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button onClick={download} disabled={busy || !from || !to}>
          {t("ui.pay.export")}
        </Button>
      </FilterBar>
      <p className="text-meta text-tinta-2">{t("ui.pay.exportHint")}</p>
      {empty && <p className="text-sm">{t("ui.pay.empty")}</p>}
      {error ? <ErrorBox error={error} /> : null}
    </div>
  );
}
