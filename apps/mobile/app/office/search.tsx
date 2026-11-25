/**
 * Buscador: un campo que encuentra estancias, lotes, tareas, registros (por el texto del resumen),
 * productos y animales en la base local, agrupado por tipo. Anda sin señal. Tocar un resultado abre lo que corresponde.
 */
import { useDeferredValue, useMemo, useState } from "react";
import { router } from "expo-router";
import { Beef, ClipboardList, Package, Sprout, Trees } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { describeRecord, t, type MessageKey } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { setSelectedFarm } from "../../src/lib/farmFilter";
import { matchesQuery } from "../../src/lib/plotInfo";
import { useLocal } from "../../src/lib/useLocal";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { TextField } from "../../src/office/ui";
import { RECORD_ICON } from "../../src/ui/icons";
import { EmptyState, Row, SectionHeader } from "../../src/ui/kit";

const PER_GROUP = 5;
const k = (s: string) => s as MessageKey;
const day = (ms: number) => new Date(ms).toLocaleDateString("es-PY", { day: "numeric", month: "short" });

interface Hit {
  id: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  open: () => void;
}
interface Group {
  key: string;
  title: string;
  hits: Hit[];
}

const safe = (data: string): Record<string, unknown> => {
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/** Buscador global sin conexión: estancias, lotes, tareas y registros del celular. */
export default function Search() {
  const [text, setText] = useState("");
  const [all, setAll] = useState<Record<string, boolean>>({});
  const query = useDeferredValue(text.trim());
  const base = useLocal(() => {
    const db = getDb();
    return { farms: db.farms(), plots: db.plots(), tasks: db.allTasks().filter((x) => x.status !== "cancelled"), records: db.records(500), products: db.products() };
  });
  const names = useMemo(() => ({ farm: new Map(base.farms.map((f) => [f.id, f.name])), plot: new Map(base.plots.map((p) => [p.id, p.name])) }), [base]);
  const animals = useLocal(() => (query ? getDb().animals(query, 30) : []), [query]);

  const groups = useMemo<Group[]>(() => {
    if (!query) return [];
    const out: Group[] = [
      {
        key: "farms",
        title: t("ui.search.farms"),
        hits: base.farms
          .filter((f) => matchesQuery(query, f.name, f.department, f.district))
          .map((f) => ({
            id: f.id,
            title: f.name,
            subtitle: [f.district, f.department].filter(Boolean).join(", ") || undefined,
            icon: Trees,
            open: () => {
              setSelectedFarm(f.id);
              router.navigate("/(tabs)/map");
            },
          })),
      },
      {
        key: "plots",
        title: t("ui.search.plots"),
        hits: base.plots
          .filter((p) => matchesQuery(query, p.name, p.crop ? t(k(`ui.crop.name_${p.crop}`)) : null, names.farm.get(p.farmId)))
          .map((p) => ({ id: p.id, title: p.name, subtitle: [names.farm.get(p.farmId), p.crop ? t(k(`ui.crop.name_${p.crop}`)) : t("ui.common.pasture")].filter(Boolean).join(", "), icon: Sprout, open: () => router.push({ pathname: "/plot/[id]", params: { id: p.id } }) })),
      },
      {
        key: "tasks",
        title: t("office.search.tasks"),
        hits: base.tasks
          .filter((x) => matchesQuery(query, x.title))
          .map((x) => ({ id: x.id, title: x.title, subtitle: [x.plotId ? names.plot.get(x.plotId) : names.farm.get(x.farmId), x.status === "done" ? t("ui.status.done") : x.dueDate].filter(Boolean).join(", "), icon: ClipboardList, open: () => router.push({ pathname: "/task/[id]", params: { id: x.id } }) })),
      },
      {
        key: "records",
        title: t("ui.search.records"),
        hits: base.records
          .map((r) => ({ r, summary: describeRecord(r.kind, safe(r.data)) }))
          .filter(({ r, summary }) => matchesQuery(query, summary, t(k(`record-kinds.kind.${r.kind}`)), r.plotId ? names.plot.get(r.plotId) : null))
          .map(({ r, summary }) => ({ id: r.id, title: summary, subtitle: [t(k(`record-kinds.kind.${r.kind}`)), r.plotId ? names.plot.get(r.plotId) : names.farm.get(r.farmId), day(r.capturedAt)].filter(Boolean).join(", "), icon: RECORD_ICON[r.kind], open: () => router.push({ pathname: "/record/[id]", params: { id: r.id } }) })),
      },
      {
        key: "products",
        title: t("ui.products.title"),
        hits: base.products
          .filter((p) => matchesQuery(query, p.name, p.activeIngredient))
          .map((p) => ({ id: p.id, title: p.name, subtitle: [t(k(`fields.product.type_${p.type}`)), p.activeIngredient].filter(Boolean).join(", "), icon: Package, open: () => router.push({ pathname: "/office/products" }) })),
      },
      {
        key: "animals",
        title: t("office.search.animals"),
        hits: animals.map((a) => ({ id: a.id, title: a.tag, subtitle: [t(k(`fields.herd.${a.category}`)), names.farm.get(a.farmId)].filter(Boolean).join(", "), icon: Beef, open: () => router.push("/animals") })),
      },
    ];
    return out.filter((g) => g.hits.length > 0);
  }, [query, base, names, animals]);

  return (
    <OfficeScreen title={t("office.search.title")}>
      <TextField label={t("ui.search.label")} value={text} onChangeText={setText} placeholder={t("office.search.placeholder")} autoCapitalize="none" />
      {!query ? (
        <EmptyState title={t("office.search.start")} hint={t("office.search.startHint")} />
      ) : groups.length === 0 ? (
        <EmptyState title={t("ui.search.noResults")} hint={t("office.search.noResultsHint")} />
      ) : (
        groups.map((g) => {
          const open = all[g.key];
          const hits = open ? g.hits : g.hits.slice(0, PER_GROUP);
          return (
            <>
              <SectionHeader key={`${g.key}-h`} title={`${g.title}, ${g.hits.length}`} action={g.hits.length > PER_GROUP ? (open ? t("office.search.less") : t("office.search.all", { n: g.hits.length })) : undefined} onAction={() => setAll({ ...all, [g.key]: !open })} />
              {hits.map((h) => (
                <Row key={`${g.key}-${h.id}`} icon={h.icon} title={h.title} subtitle={h.subtitle} onPress={h.open} />
              ))}
            </>
          );
        })
      )}
    </OfficeScreen>
  );
}
