/** Quién cambió qué y cuándo (solo el dueño). */
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AuditList, type AuditEntryRow } from "../components/AuditList";
import { Button, EmptyState, ErrorBox, FilterBar, Select, Spinner, Page } from "../components/ui";
import { get, withQs } from "../lib/api";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";

const ENTITIES = ["", "farm", "plot", "member", "task", "record", "poi", "product", "season"] as const;

/** Quién cambió qué y cuándo (solo el dueño). */
export function AuditPage() {
  const me = useMe();
  const [entity, setEntity] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["audit", entity],
    enabled: me.data?.role === "owner",
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      get<{ rows: AuditEntryRow[]; hasMore: boolean }>(
        withQs("/org/audit", { entity: entity || undefined, before: pageParam }),
      ),
    getNextPageParam: (last) => (last.hasMore ? last.rows[last.rows.length - 1]?.createdAt : undefined),
  });
  if (me.data && me.data.role !== "owner") return <div className="p-6">{t("ui.audit.ownerOnly")}</div>;
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  return (
    <Page width="data" title={t("ui.audit.title")} back={{ to: "/equipo", label: t("ui.team.title") }}>
      <p className="-mt-2 text-sm text-tinta-2">{t("ui.audit.intro")}</p>
      {(entity || rows.length > 0) && <FilterBar>
        <div className="w-56">
          <Select
            aria-label={t("ui.audit.filter")}
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            options={ENTITIES.map((e) => ({ value: e, label: e ? tk(`ui.audit.entity_${e}`) : t("ui.audit.all") }))}
          />
        </div>
      </FilterBar>}
      {q.isPending && me.data?.role === "owner" && <Spinner />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && !rows.length ? <EmptyState title={t("ui.audit.empty")} /> : <AuditList rows={rows} />}
      {q.hasNextPage && (
        <div>
          <Button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {t("ui.audit.more")}
          </Button>
        </div>
      )}
    </Page>
  );
}
