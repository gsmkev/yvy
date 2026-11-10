import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueries } from "@tanstack/react-query";
import { get } from "../lib/api";
import { describeData } from "../lib/exports";
import { t, tk, type MessageKey } from "../lib/i18n";
import { fetchRecordsPage, useFarms, useMe, useMembers } from "../lib/queries";
import type { FarmDetail } from "../lib/types";

type Kind = "farms" | "plots" | "members" | "pois" | "records";
interface Hit {
  key: string;
  kind: Kind;
  title: string;
  sub?: string;
  go: () => void;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const GROUPS: { kind: Kind; label: MessageKey }[] = [
  { kind: "farms", label: "ui.searchFarms" },
  { kind: "plots", label: "ui.searchPlots" },
  { kind: "members", label: "ui.searchMembers" },
  { kind: "pois", label: "ui.searchPois" },
  { kind: "records", label: "ui.searchRecords" },
];
const MAX_PER_GROUP = 6;
const MAX_FARMS_SCANNED = 30;

/** Buscador de la barra superior: usa lo que la API ya devuelve (estancias, lotes, equipo, puntos) y la última página de registros. */
export function GlobalSearch({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const active = open && q.trim().length >= 2;

  const me = useMe();
  const farms = useFarms();
  const members = useMembers(!!me.data && me.data.role !== "worker");
  const details = useQueries({
    queries: (farms.data ?? []).slice(0, MAX_FARMS_SCANNED).map((f) => ({
      queryKey: ["farm", f.id],
      queryFn: async () => get<FarmDetail>(`/org/farms/${f.id}`),
      enabled: active,
      staleTime: 60_000,
    })),
  });
  const recs = useQuery({
    queryKey: ["search-records"],
    queryFn: () => fetchRecordsPage({}, null, 100),
    enabled: active,
    staleTime: 60_000,
  });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const n = norm(q.trim());
    if (n.length < 2) return [];
    const has = (...s: (string | null | undefined)[]) => s.some((x) => x && norm(x).includes(n));
    const farmName = new Map((farms.data ?? []).map((f) => [f.id, f.name]));
    const out: Record<Kind, Hit[]> = { farms: [], plots: [], members: [], pois: [], records: [] };
    const toFarm = (farmId: string, lote?: string) => () => {
      setOpen(false);
      setQ("");
      navigate({ to: "/estancias/$farmId", params: { farmId }, search: lote ? { lote } : {} });
    };
    for (const f of farms.data ?? [])
      if (has(f.name, f.department))
        out.farms.push({ key: `f${f.id}`, kind: "farms", title: f.name, sub: f.department ?? undefined, go: toFarm(f.id) });
    for (const d of details) {
      if (!d.data) continue;
      for (const p of d.data.plots)
        if (has(p.name, p.crop))
          out.plots.push({
            key: `p${p.id}`,
            kind: "plots",
            title: p.name,
            sub: [farmName.get(p.farmId), p.crop].filter(Boolean).join(" · "),
            go: toFarm(p.farmId, p.id),
          });
      for (const p of d.data.pois)
        if (has(p.name))
          out.pois.push({
            key: `o${p.id}`,
            kind: "pois",
            title: p.name,
            sub: [farmName.get(p.farmId), tk(`ui.poiKinds_${p.kind}`)].join(" · "),
            go: toFarm(p.farmId),
          });
    }
    for (const m of members.data ?? [])
      if (has(m.fullName, m.email, m.phone))
        out.members.push({
          key: `m${m.userId}`,
          kind: "members",
          title: m.fullName,
          sub: tk(`ui.role_${m.role}`),
          go: () => {
            setOpen(false);
            setQ("");
            navigate({ to: "/equipo" });
          },
        });
    for (const r of recs.data?.rows ?? []) {
      const text = describeData(r.kind, r.data);
      if (has(text, tk(`recordKinds.${r.kind}`), r.authorName, r.plotName))
        out.records.push({
          key: `r${r.id}`,
          kind: "records",
          title: text,
          sub: [tk(`recordKinds.${r.kind}`), r.plotName ?? farmName.get(r.farmId)].filter(Boolean).join(" · "),
          go: toFarm(r.farmId, r.plotId ?? undefined),
        });
    }
    return GROUPS.flatMap((g) => out[g.kind].slice(0, MAX_PER_GROUP));
  }, [q, farms.data, members.data, recs.data, details.map((d) => d.dataUpdatedAt).join(",")]);

  useEffect(() => setCursor(0), [q]);
  const loading = active && (details.some((d) => d.isLoading) || recs.isLoading);
  const idx = Math.min(cursor, Math.max(hits.length - 1, 0));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      setCursor((idx + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setCursor((idx - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[idx]) {
      e.preventDefault();
      hits[idx]!.go();
    }
  };

  return (
    <div ref={box} className="relative hidden w-56 shrink-0 md:block lg:w-72">
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={active}
        aria-controls="search-results"
        aria-label={t("ui.searchLabel")}
        title={t("ui.searchShortcutHint")}
        placeholder={t("ui.searchPlaceholder")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        className="h-9 w-full rounded-md border border-linea bg-papel px-3 text-sm outline-none placeholder:text-tinta-2/60 focus:border-accion focus:ring-2 focus:ring-accion/20"
      />
      {active && (
        <div
          id="search-results"
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-[70vh] min-w-80 overflow-auto rounded-md border border-linea bg-papel lg:min-w-96"
        >
          {hits.length === 0 && (
            <p className="px-3 py-3 text-sm text-tinta-2">{loading ? t("ui.searching") : t("ui.searchNoResults")}</p>
          )}
          {GROUPS.map((g) => {
            const rows = hits.filter((h) => h.kind === g.kind);
            if (!rows.length) return null;
            return (
              <div key={g.kind}>
                <p className="px-3 pt-3 pb-1 text-xs text-tinta-2">{t(g.label)}</p>
                <ul>
                  {rows.map((h) => (
                    <li
                      key={h.key}
                      role="option"
                      aria-selected={hits[idx] === h}
                      className="border-b border-linea last:border-0"
                    >
                      <button
                        type="button"
                        onMouseEnter={() => setCursor(hits.indexOf(h))}
                        onClick={h.go}
                        className={`flex w-full cursor-pointer flex-col px-3 py-2 text-left ${hits[idx] === h ? "bg-surco/[0.05]" : ""}`}
                      >
                        <span className="truncate text-sm font-medium">{h.title}</span>
                        {h.sub && <span className="truncate text-xs text-tinta-2">{h.sub}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
