import { FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { BRAND, RECORD_KINDS } from "@yvy/shared";
import { FarmMap } from "../components/FarmMap";
import { RecordsList } from "../components/RecordsList";
import { Button, ErrorBox, Field, Input, Select } from "../components/ui";
import { recordsToExcel } from "../lib/exports";
import { t, tk } from "../lib/i18n";
import { fetchAllRecords, useFarms, useMe, useMembers, type RecordFilters } from "../lib/queries";
import type { RecordRow } from "../lib/types";

const toMs = (d: string, end = false) => (d ? Date.parse(`${d}T${end ? "23:59:59" : "00:00:00"}-03:00`) : undefined);

export function RecordsPage() {
  const farms = useFarms();
  const me = useMe();
  const members = useMembers();
  const [f, setF] = useState({ farmId: "", authorId: "", kind: "", from: "", to: "" });
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const filters: RecordFilters = useMemo(
    () => ({
      farmId: f.farmId || undefined,
      authorId: f.authorId || undefined,
      kind: f.kind || undefined,
      from: toMs(f.from),
      to: toMs(f.to, true),
    }),
    [f],
  );
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const exportExcel = async () => {
    setExporting(true);
    setError(null);
    try {
      await recordsToExcel(await fetchAllRecords(filters), `registros-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      setError(e);
    } finally {
      setExporting(false);
    }
  };
  const pts = rows.filter((r) => r.lat !== null);
  const bounds: [number, number, number, number] | null = pts.length
    ? [
        Math.min(...pts.map((p) => p.lon!)) - 0.01,
        Math.min(...pts.map((p) => p.lat!)) - 0.01,
        Math.max(...pts.map((p) => p.lon!)) + 0.01,
        Math.max(...pts.map((p) => p.lat!)) + 0.01,
      ]
    : null;

  return (
    <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_480px]">
      <div className="h-72 lg:h-full">
        <FarmMap
          farms={(farms.data ?? []).map((f) => ({
            id: f.id,
            name: f.name,
            geometry: f.geometry,
            basemapPath: f.basemapPath,
          }))}
          tilesBaseUrl={me.data?.tilesBaseUrl}
          points={pts.map((r) => ({ id: r.id, lon: r.lon!, lat: r.lat!, color: BRAND.trigo }))}
          bounds={bounds}
        />
      </div>
      <section className="flex min-h-0 flex-col gap-3 overflow-auto p-4 *:shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t("ui.navRecords")}</h1>
          <Button icon={FileSpreadsheet} onClick={exportExcel} disabled={exporting}>
            {t("ui.exportExcel")}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("ui.farm")}>
            <Select
              value={f.farmId}
              onChange={set("farmId")}
              options={[
                { value: "", label: t("ui.all") },
                ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name })),
              ]}
            />
          </Field>
          <Field label={t("ui.author")}>
            <Select
              value={f.authorId}
              onChange={set("authorId")}
              options={[
                { value: "", label: t("ui.all") },
                ...(members.data ?? []).map((m) => ({ value: m.userId, label: m.fullName })),
              ]}
            />
          </Field>
          <Field label={t("ui.kind")}>
            <Select
              value={f.kind}
              onChange={set("kind")}
              options={[
                { value: "", label: t("ui.all") },
                ...RECORD_KINDS.map((k) => ({ value: k, label: tk(`recordKinds.${k}`) })),
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("ui.from")}>
              <Input type="date" value={f.from} onChange={set("from")} />
            </Field>
            <Field label={t("ui.to")}>
              <Input type="date" value={f.to} onChange={set("to")} />
            </Field>
          </div>
        </div>
        {error ? <ErrorBox error={error} /> : null}
        <RecordsList filters={filters} onRows={setRows} />
      </section>
    </div>
  );
}
