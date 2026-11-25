/** Pantalla de registros con filtros guardados, lista y exportación. */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { isFieldRole, RECORD_KINDS } from "@yvy/shared";
import { FarmMap } from "../components/FarmMap";
import { ActionMenu, ExportMenu } from "../components/menus";
import { RecordsList } from "../components/RecordsList";
import { DateRange, ErrorBox, Field, FilterBar, Form, FormFooter, Input, Modal, PageHeader, Select } from "../components/ui";
import { recordsTable, recordsToExcel } from "../lib/exports";
import { DEFAULT_TZ, dayToMs } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { RECORD_GROUPS, recordColor, recordGroup } from "../lib/recordColors";
import { deleteFilter, loadSavedFilters, saveFilter, type RecordFilterValues, type SavedFilter } from "../lib/savedFilters";
import { tableToCsv } from "../lib/tableExport";
import { fetchAllRecords, useFarms, useMe, useMembers, type RecordFilters } from "../lib/queries";
import type { RecordRow } from "../lib/types";

const EMPTY: RecordFilterValues = { farmId: "", authorId: "", kind: "", from: "", to: "" };

/** Registros de campo con filtros por estancia, lote, tipo y fechas. */
export function RecordsPage() {
  const farms = useFarms();
  const me = useMe();
  const members = useMembers();
  const [f, setF] = useState<RecordFilterValues>(EMPTY);
  // Huso de la estancia elegida; con "Todas", el de Paraguay
  const tz = farms.data?.find((x) => x.id === f.farmId)?.timezone ?? DEFAULT_TZ;
  const [saved, setSaved] = useState<SavedFilter[]>(loadSavedFilters);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const filters: RecordFilters = useMemo(
    () => ({
      farmId: f.farmId || undefined,
      authorId: f.authorId || undefined,
      kind: f.kind || undefined,
      from: dayToMs(f.from, tz),
      to: dayToMs(f.to, tz, true),
    }),
    [f, tz],
  );
  const review = !!me.data && !isFieldRole(me.data.role);
  const active = Object.values(f).filter(Boolean).length;
  const set = (k: keyof RecordFilterValues) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const pts = rows.filter((r) => r.lat !== null);
  const present = RECORD_GROUPS.filter((g) => pts.some((r) => recordGroup(r.kind) === g.id));
  const bounds: [number, number, number, number] | null = pts.length
    ? [
        Math.min(...pts.map((p) => p.lon!)) - 0.01,
        Math.min(...pts.map((p) => p.lat!)) - 0.01,
        Math.max(...pts.map((p) => p.lon!)) + 0.01,
        Math.max(...pts.map((p) => p.lat!)) + 0.01,
      ]
    : null;
  const stamp = () => new Date().toISOString().slice(0, 10);
  const all = async () => {
    setError(null);
    try {
      return await fetchAllRecords(filters);
    } catch (e) {
      setError(e);
      throw e;
    }
  };

  const fields = (
    <>
      <Field label={t("ui.common.farm")}>
        <Select value={f.farmId} onChange={set("farmId")} options={[{ value: "", label: t("ui.all.farms") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
      </Field>
      <Field label={t("ui.common.author")}>
        <Select value={f.authorId} onChange={set("authorId")} options={[{ value: "", label: t("ui.all.authors") }, ...(members.data ?? []).map((m) => ({ value: m.userId, label: m.fullName }))]} />
      </Field>
      <Field label={t("ui.common.kind")}>
        <Select value={f.kind} onChange={set("kind")} options={[{ value: "", label: t("ui.all.kinds") }, ...RECORD_KINDS.map((k) => ({ value: k, label: tk(`record-kinds.kind.${k}`) }))]} />
      </Field>
      <DateRange from={f.from} to={f.to} onChange={(r) => setF({ ...f, ...r })} />
    </>
  );

  const savedMenu = (
    <ActionMenu
      label={t("ui.saved.filters")}
      items={[
        ...saved.map((sf) => ({
          label: t("ui.common.applySavedFilter", { name: sf.name }),
          onSelect: () => setF(sf.filters),
        })),
        { label: t("ui.saved.filterSave"), onSelect: () => setNaming(true) },
        ...saved.map((sf) => ({
          label: t("ui.saved.filterDelete", { name: sf.name }),
          onSelect: () => setSaved(deleteFilter(sf.id)),
          danger: true,
        })),
      ]}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto lg:overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 px-4 pt-4 pb-3">
        <PageHeader
          title={t("ui.nav.records")}
          menu={
            review && (
              <Link
                to="/para-revisar"
                className="inline-flex h-10 items-center rounded-md border border-linea bg-papel px-3.5 text-sm font-medium text-surco hover:border-tinta-2/40 hover:bg-lino"
              >
                {t("ui.review.title")}
              </Link>
            )
          }
        />
        <FilterBar
          active={active}
          onClear={() => setF(EMPTY)}
          exportSlot={false}
          actions={
            <>
              {savedMenu}
              <ExportMenu
                formats={[
                  {
                    label: t("ui.export.formatExcel"),
                    run: async () => recordsToExcel(await all(), `registros-${stamp()}.xlsx`),
                  },
                  { label: t("ui.export.formatCsv"), run: async () => tableToCsv(recordsTable(await all())) },
                ]}
              />
            </>
          }
        >
          {fields}
        </FilterBar>
        {error ? <ErrorBox error={error} /> : null}
      </div>
      <div className="grid min-h-0 flex-1 border-t border-linea grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="relative h-72 lg:h-full">
          <FarmMap
            farms={(farms.data ?? []).map((x) => ({
              id: x.id,
              name: x.name,
              geometry: x.geometry,
              basemapPath: x.basemapPath,
            }))}
            tilesBaseUrl={me.data?.tilesBaseUrl}
            points={pts.map((r) => ({ id: r.id, lon: r.lon!, lat: r.lat!, color: recordColor(r.kind) }))}
            clusterPoints
            bounds={bounds}
          />
          {present.length > 0 && (
            <ul
              aria-label={t("ui.records.legend")}
              className="absolute bottom-6 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-x-3 gap-y-1 rounded-md bg-lino/90 px-2.5 py-1.5 text-xs text-surco"
            >
              {present.map((g) => (
                <li key={g.id} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full border border-surco/40"
                    style={{ background: g.color }}
                  />
                  {tk(`ui.rec.group_${g.id}`)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <section className="flex min-h-0 flex-col gap-3 p-4 lg:overflow-auto lg:border-l lg:border-linea *:shrink-0">
          <RecordsList filters={filters} onRows={setRows} />
        </section>
      </div>
      {naming && (
        <Modal title={t("ui.saved.filterSave")} onClose={() => setNaming(false)}>
          <Form
            className="flex flex-col gap-4"
            onSubmit={() => {
              if (!name.trim()) return;
              setSaved(saveFilter(name, f));
              setName("");
              setNaming(false);
            }}
          >
            <Field label={t("ui.saved.filterName")}>
              <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Field>
            <FormFooter error={null} disabled={!name.trim()} />
          </Form>
        </Modal>
      )}
    </div>
  );
}
