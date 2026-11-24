import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { isFieldRole, RECORD_KINDS } from "@yvy/shared";
import { FarmMap } from "../components/FarmMap";
import { ActionMenu, ExportMenu } from "../components/menus";
import { RecordsList } from "../components/RecordsList";
import { Button, ErrorBox, Field, FilterBar, Input, Modal, PageHeader, Select } from "../components/ui";
import { recordsTable, recordsToExcel } from "../lib/exports";
import { DEFAULT_TZ, dayToMs } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { RECORD_GROUPS, recordColor, recordGroup } from "../lib/recordColors";
import { deleteFilter, loadSavedFilters, saveFilter, type RecordFilterValues, type SavedFilter } from "../lib/savedFilters";
import { tableToCsv } from "../lib/tableExport";
import { fetchAllRecords, useFarms, useMe, useMembers, type RecordFilters } from "../lib/queries";
import type { RecordRow } from "../lib/types";

const EMPTY: RecordFilterValues = { farmId: "", authorId: "", kind: "", from: "", to: "" };

export function RecordsPage() {
  const farms = useFarms();
  const me = useMe();
  const members = useMembers();
  const [f, setF] = useState<RecordFilterValues>(EMPTY);
  // Huso de la estancia elegida; con "Todas", el de Paraguay
  const tz = farms.data?.find((x) => x.id === f.farmId)?.timezone ?? DEFAULT_TZ;
  const [saved, setSaved] = useState<SavedFilter[]>(loadSavedFilters);
  const [naming, setNaming] = useState(false);
  const [sheet, setSheet] = useState(false);
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

  const fields = (labelled: boolean) => {
    // Un filtro con valor se distingue por el borde de acento
    const mark = (v: string) => (!labelled && v ? "[&_select]:border-accion" : "");
    const cls = (v: string) => (labelled ? "" : `min-w-0 max-w-56 flex-1 ${mark(v)}`);
    const farm = (
      <Select
        aria-label={t("ui.common.farm")}
        className={cls(f.farmId)}
        value={f.farmId}
        onChange={set("farmId")}
        options={[{ value: "", label: t("ui.all.farms") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]}
      />
    );
    const author = (
      <Select
        aria-label={t("ui.common.author")}
        className={cls(f.authorId)}
        value={f.authorId}
        onChange={set("authorId")}
        options={[
          { value: "", label: t("ui.all.authors") },
          ...(members.data ?? []).map((m) => ({ value: m.userId, label: m.fullName })),
        ]}
      />
    );
    const kind = (
      <Select
        aria-label={t("ui.common.kind")}
        className={cls(f.kind)}
        value={f.kind}
        onChange={set("kind")}
        options={[
          { value: "", label: t("ui.all.kinds") },
          ...RECORD_KINDS.map((k) => ({ value: k, label: tk(`record-kinds.kind.${k}`) })),
        ]}
      />
    );
    const from = <Input className={`w-full ${!labelled && f.from ? "!border-accion" : ""}`} aria-label={t("ui.common.from")} type="date" value={f.from} onChange={set("from")} />;
    const to = <Input className={`w-full ${!labelled && f.to ? "!border-accion" : ""}`} aria-label={t("ui.common.to")} type="date" value={f.to} onChange={set("to")} />;
    if (labelled)
      return (
        <div className="flex flex-col gap-3">
          <Field label={t("ui.common.farm")}>{farm}</Field>
          <Field label={t("ui.common.author")}>{author}</Field>
          <Field label={t("ui.common.kind")}>{kind}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("ui.common.from")}>{from}</Field>
            <Field label={t("ui.common.to")}>{to}</Field>
          </div>
        </div>
      );
    return (
      <>
        {farm}
        {author}
        {kind}
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-tinta-2">
          {t("ui.common.from")}
          <span className="w-32">{from}</span>
        </label>
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-tinta-2">
          {t("ui.common.to")}
          <span className="w-32">{to}</span>
        </label>
      </>
    );
  };

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
            <>
              {review && (
                <Link
                  to="/para-revisar"
                  className="hidden h-10 lg:inline-flex items-center rounded-md border border-linea bg-papel px-3.5 text-sm font-medium text-surco hover:border-tinta-2/40 hover:bg-lino"
                >
                  {t("ui.review.title")}
                </Link>
              )}
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
        />
        <div className="hidden lg:block">
          <FilterBar
            actions={
              <>
                {active > 0 && (
                  <Button variant="quiet" onClick={() => setF(EMPTY)}>
                    {t("ui.common.clearFilters")}
                  </Button>
                )}
                {savedMenu}
              </>
            }
          >
            {fields(false)}
          </FilterBar>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <Button onClick={() => setSheet(true)} className="gap-2">
            <SlidersHorizontal size={16} aria-hidden />
            {active > 0 ? t("ui.common.filtersActive", { n: active }) : t("ui.common.filters")}
          </Button>
          {savedMenu}
          {review && (
            <Link
              to="/para-revisar"
              className="ml-auto inline-flex h-12 items-center rounded-md px-3 text-sm font-medium text-accion underline underline-offset-4"
            >
              {t("ui.review.title")}
            </Link>
          )}
        </div>
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
      {sheet && (
        <Modal sheet title={t("ui.common.filters")} onClose={() => setSheet(false)}>
          {fields(true)}
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={() => setSheet(false)}>
              {t("ui.common.apply")}
            </Button>
            {active > 0 && (
              <Button variant="quiet" onClick={() => setF(EMPTY)}>
                {t("ui.common.clearFilters")}
              </Button>
            )}
          </div>
        </Modal>
      )}
      {naming && (
        <Modal title={t("ui.saved.filterSave")} onClose={() => setNaming(false)}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setSaved(saveFilter(name, f));
              setName("");
              setNaming(false);
            }}
          >
            <Field label={t("ui.saved.filterName")}>
              <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              {t("ui.common.save")}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
