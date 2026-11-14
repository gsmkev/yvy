/** Compras y ventas de hacienda: cabezas, kilos, precio y guía de traslado (E-35). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CATTLE_DEAL_KINDS, CURRENCIES, localDate, type Currency } from "@yvy/shared";
import { del, get } from "../../lib/api";
import { fmtIsoDate, fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtMoney } from "../../lib/money";
import { useFarms } from "../../lib/queries";
import { Button, Empty, ErrorBox, Spinner, toast } from "../ui";
import { useSeasonList } from "./CostsPanel";
import { PhotoRowMenu } from "./InvoicePhoto";
import { HeaderActions } from "./adminSlot";
import { RowModal, type FieldDef } from "./MasterPanel";
import { useParties } from "./PartiesPanel";
import { ExportableTable } from "../ExportableTable";

interface Deal {
  id: string;
  kind: (typeof CATTLE_DEAL_KINDS)[number];
  date: string;
  partyId: string | null;
  category: string | null;
  heads: number;
  totalKg: number;
  amount: number;
  currency: Currency;
  guideNumber: string | null;
  pricePerKg: number | null;
  kgPerHead: number | null;
  photoPath: string | null;
}

export function CattlePanel() {
  const q = useQuery({ queryKey: ["erp", "cattle-deals"], queryFn: () => get<Deal[]>("/org/erp/cattle-deals") });
  const parties = useParties();
  const farms = useFarms();
  const seasons = useSeasonList();
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/cattle-deals/${id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const fields: FieldDef[] = [
    { key: "kind", label: t("ui.cattleKind"), type: "select", initial: "sell", options: CATTLE_DEAL_KINDS.map((k) => ({ value: k, label: tk(`ui.cattleKind_${k}`) })) },
    { key: "date", label: t("ui.costDate"), type: "date", required: true, initial: localDate(Date.now()) },
    { key: "partyId", label: t("ui.cattleParty"), type: "select", options: [{ value: "", label: "—" }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))] },
    { key: "farmId", label: t("ui.costFarm"), type: "select", options: [{ value: "", label: "—" }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))] },
    { key: "category", label: t("ui.cattleCategory"), maxLength: 60 },
    { key: "heads", label: t("ui.cattleHeads"), type: "number", required: true, min: 1, step: "1" },
    { key: "totalKg", label: t("ui.cattleKg"), type: "number", required: true, min: 0 },
    { key: "currency", label: t("ui.currency"), type: "select", initial: "PYG", options: CURRENCIES.map((c) => ({ value: c, label: c })) },
    { key: "amount", label: t("ui.cattleAmount"), type: "money", required: true, currencyKey: "currency" },
    { key: "guideNumber", label: t("ui.cattleGuide"), maxLength: 40 },
    { key: "dueDate", label: t("ui.purchDueLabel"), type: "date" },
    { key: "seasonId", label: t("ui.costSeason"), type: "select", options: [{ value: "", label: "—" }, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))] },
  ];
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "";
  return (
    <div className="flex flex-col gap-4">
      <HeaderActions>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t("ui.cattleNew")}
        </Button>
      </HeaderActions>
      {(q.data ?? []).length === 0 ? (
        <Empty>{t("ui.erpEmpty")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <ExportableTable name="ganado">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-tinta-2">
                  <th className="py-2 pr-4 font-medium">{t("ui.costDate")}</th>
                  <th className="py-2 pr-4 font-medium">{t("ui.cattleKind")}</th>
                  <th className="py-2 pr-4 font-medium">{t("ui.cattleParty")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.cattleHeads")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.cattleKg")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.cattlePricePerKg")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.cattleAmount")}</th>
                  <th className="py-2 pr-4 font-medium">{t("ui.cattleGuide")}</th>
                  <th className="sticky right-0 w-12 bg-lino">
                    <span className="sr-only">{t("ui.rowActionsHeader")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((d) => (
                  <tr key={d.id} className="border-b border-linea">
                    <td className="num py-2.5 pr-4">{fmtIsoDate(d.date)}</td>
                    <td className="py-2.5 pr-4">
                      {tk(`ui.cattleKind_${d.kind}`)}
                      {d.category ? <span className="text-tinta-2"> · {d.category}</span> : null}
                    </td>
                    <td className="py-2.5 pr-4">{party(d.partyId)}</td>
                    <td className="num py-2.5 pr-4 text-right">{d.heads}</td>
                    <td className="num py-2.5 pr-4 text-right">{fmtNum(d.totalKg)}</td>
                    <td className="num py-2.5 pr-4 text-right">{d.pricePerKg === null ? "" : fmtMoney(Math.round(d.pricePerKg), d.currency)}</td>
                    <td className="num py-2.5 pr-4 text-right font-medium">{fmtMoney(d.amount, d.currency)}</td>
                    <td className="py-2.5 pr-4 text-tinta-2">{d.guideNumber ?? ""}</td>
                    <td className="sticky right-0 w-12 bg-lino py-1 text-right">
                      <PhotoRowMenu kind="cattle-deals" id={d.id} hasPhoto={!!d.photoPath} name={fmtIsoDate(d.date)} onDelete={() => remove.mutate(d.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
        </div>
      )}
      {remove.error ? <ErrorBox error={remove.error} /> : null}
      {creating && <RowModal title={t("ui.cattleNew")} fields={fields} row={null} path="cattle-deals" onClose={() => setCreating(false)} />}
    </div>
  );
}
