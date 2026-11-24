/** Saldo por empleado con su cuenta corriente, adelantos y pagos. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EMPLOYEE_PAYMENT_KINDS, localDate } from "@yvy/shared";
import { del, get, post } from "../../../lib/api";
import { fmtIsoDate } from "../../../lib/format";
import { t, tk } from "../../../lib/i18n";
import { fmtGs } from "../../../lib/money";
import { Button, type Column, DataTable, EmptyState, ErrorBox, Field, Form, FormFooter, Input, Modal, Select, Spinner, toast } from "../../ui";
import { RowMenu } from "../adminSlot";
import { NoStaff } from "./employees";
import { PayrollExport } from "./PayrollExport";

interface Balance {
  employeeId: string;
  name: string;
  days: number;
  accruedPyg: number;
  advancesPyg: number;
  paymentsPyg: number;
  balancePyg: number;
}
interface Line {
  id: string;
  date: string;
  kind: "wage" | "advance" | "payment";
  amountPyg: number;
  balancePyg: number;
  note: string | null;
}

/** Saldo por empleado (devengado - adelantos - pagos), con su cuenta corriente y el alta de adelantos y pagos. */
export function BalancesTab({ onGoEmployees }: { onGoEmployees: () => void }) {
  const q = useQuery({ queryKey: ["erp", "employee-balance"], queryFn: () => get<Balance[]>("/org/erp/employees/balance") });
  const [paying, setPaying] = useState<Balance | null>(null);
  const [viewing, setViewing] = useState<Balance | null>(null);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <NoStaff onGo={onGoEmployees} />;
  const cols: Column<Balance>[] = [
    { id: "name", header: t("ui.staff.name"), cell: (r) => r.name },
    { id: "days", header: t("ui.bal.days"), align: "right", hideBelow: "md", cell: (r) => r.days },
    { id: "accrued", header: t("ui.bal.accrued"), align: "right", hideBelow: "sm", cell: (r) => fmtGs(r.accruedPyg) },
    { id: "advances", header: t("ui.bal.advances"), align: "right", hideBelow: "lg", cell: (r) => fmtGs(r.advancesPyg) },
    { id: "payments", header: t("ui.bal.payments"), align: "right", hideBelow: "lg", cell: (r) => fmtGs(r.paymentsPyg) },
    { id: "balance", header: t("ui.bal.balance"), align: "right", cell: (r) => <span className={`font-medium ${r.balancePyg < 0 ? "text-peligro" : ""}`}>{fmtGs(r.balancePyg)}</span> },
    {
      id: "_actions",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      cell: (r) => (
        <span className="inline-flex gap-1 whitespace-nowrap">
          <Button variant="quiet" size="sm" onClick={() => setPaying(r)}>
            {t("ui.bal.pay")}
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setViewing(r)}>
            {t("ui.bal.statement")}
          </Button>
        </span>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PayrollExport />
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.employeeId} caption={t("ui.staff.balances")} />
      <p className="text-meta text-tinta-2">{t("ui.bal.intro")}</p>
      {paying && <PayModal row={paying} onClose={() => setPaying(null)} />}
      {viewing && <StatementModal row={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function PayModal({ row, onClose }: { row: Balance; onClose: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState("advance");
  const [date, setDate] = useState(localDate(Date.now()));
  const [amount, setAmount] = useState(row.balancePyg > 0 ? String(row.balancePyg) : "");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => post("/org/erp/employee-payments", { employeeId: row.employeeId, kind, date, amountPyg: Number(amount), note: note || null }),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={`${t("ui.bal.pay")}: ${row.name}`} onClose={onClose}>
      <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
        <Field label={t("ui.cost.category")}>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} options={EMPLOYEE_PAYMENT_KINDS.map((k) => ({ value: k, label: tk(`ui.bal.kind_${k}`) }))} />
        </Field>
        <Field label={t("ui.cost.date")}>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("ui.bal.amount")}>
          <Input required type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("ui.bal.note")}>
          <Input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}

function StatementModal({ row, onClose }: { row: Balance; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["erp", "employee-statement", row.employeeId], queryFn: () => get<Line[]>(`/org/erp/employees/${row.employeeId}/statement`) });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/employee-payments/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  return (
    <Modal title={`${t("ui.bal.statement")}: ${row.name}`} onClose={onClose}>
      {q.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={[
            { id: "date", header: t("ui.cost.date"), cell: (l: Line) => fmtIsoDate(l.date) },
            {
              id: "kind",
              header: t("ui.cost.category"),
              cell: (l: Line) => (
                <>
                  {tk(`ui.bal.kind_${l.kind}`)}
                  {l.note ? <span className="text-tinta-2">: {l.note}</span> : null}
                </>
              ),
            },
            { id: "amount", header: t("ui.bal.amount"), align: "right", cell: (l: Line) => <span className={l.amountPyg < 0 ? "text-tinta-2" : ""}>{fmtGs(l.amountPyg)}</span> },
            { id: "balance", header: t("ui.bal.balance"), align: "right", cell: (l: Line) => <span className="font-medium">{fmtGs(l.balancePyg)}</span> },
            { id: "_actions", header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>, align: "right", width: "3rem", cell: (l: Line) => (l.kind !== "wage" ? <RowMenu name={fmtIsoDate(l.date)} onDelete={() => remove.mutate(l.id)} /> : null) },
          ]}
          rows={q.data ?? []}
          rowKey={(l) => l.id}
          empty={<EmptyState compact title={t("ui.erp.empty")} />}
        />
      )}
    </Modal>
  );
}
