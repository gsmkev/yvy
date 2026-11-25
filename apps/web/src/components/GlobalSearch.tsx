import { useEffect, useMemo, useRef, useState } from "react";
import { isFieldRole } from "@yvy/shared";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueries } from "@tanstack/react-query";
import { get } from "../lib/api";
import { t } from "../lib/i18n";
import { normSearch, SEARCH_GROUPS, searchHits, type SearchHit } from "../lib/searchHits";
import { fetchRecordsPage, useFarms, useMe, useMembers } from "../lib/queries";
import type { FarmDetail } from "../lib/types";

const MAX_PER_GROUP = 6;
const MAX_FARMS_SCANNED = 30;

/** Buscador de la barra superior: usa lo que la API ya devuelve (estancias, lotes, equipo, puntos) y la última página de registros. */
export function GlobalSearch({
  inputRef,
  className = "relative w-full",
  listClassName = "min-w-80 lg:min-w-96",
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  className?: string;
  listClassName?: string;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const active = open && q.trim().length >= 2;

  const me = useMe();
  const farms = useFarms();
  const members = useMembers(!!me.data && !isFieldRole(me.data.role));
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

  const hits = useMemo<SearchHit[]>(() => {
    const n = normSearch(q.trim());
    if (n.length < 2) return [];
    const reset = () => {
      setOpen(false);
      setQ("");
    };
    return searchHits(
      n,
      {
        farms: farms.data ?? [],
        details: details.flatMap((d) => (d.data ? [d.data] : [])),
        members: members.data ?? [],
        records: recs.data?.rows ?? [],
        toFarm: (farmId, lote) => () => {
          reset();
          navigate({ to: "/estancias/$farmId", params: { farmId }, search: lote ? { lote } : {} });
        },
        toTeam: () => {
          reset();
          navigate({ to: "/equipo" });
        },
      },
      MAX_PER_GROUP,
    );
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
    <div ref={box} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={active}
        aria-controls="search-results"
        aria-label={t("ui.search.label")}
        title={t("ui.search.shortcutHint")}
        aria-keyshortcuts="/ Control+K"
        placeholder={t("ui.search.placeholder")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        className="h-10 w-full rounded-md border border-linea bg-papel pr-8 pl-3 text-sm outline-none placeholder:text-tinta-2/60 focus:border-accion focus:ring-2 focus:ring-accion/20"
      />
      {!q && (
        <kbd
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 hidden h-5 -translate-y-1/2 items-center rounded border border-linea px-1.5 font-sans text-xs text-tinta-2 lg:flex"
        >
          /
        </kbd>
      )}
      {active && (
        <div
          id="search-results"
          role="listbox"
          className={`absolute top-full right-0 left-0 z-30 mt-1 max-h-[70vh] overflow-auto rounded-md border border-linea bg-papel ${listClassName}`}
        >
          {hits.length === 0 && (
            <p className="px-3 py-3 text-sm text-tinta-2">{loading ? t("ui.common.searching") : t("ui.search.noResults")}</p>
          )}
          {SEARCH_GROUPS.map((g) => {
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
