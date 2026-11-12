import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AuditList, type AuditEntryRow } from "../components/AuditList";
import { Button, Empty, ErrorBox, Select, Spinner } from "../components/ui";
import { get, qs } from "../lib/api";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";

const ENTITIES = ["", "farm", "plot", "member", "task", "record", "poi", "product", "season"] as const;

/** K-06: quién cambió qué y cuándo (solo el dueño). */
export function AuditPage() {
  const me = useMe();
  const [entity, setEntity] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["audit", entity],
    enabled: me.data?.role === "owner",
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      get<{ rows: AuditEntryRow[]; hasMore: boolean }>(`/org/audit${qs({ entity: entity || undefined, before: pageParam })}`),
    getNextPageParam: (last) => (last.hasMore ? last.rows[last.rows.length - 1]?.createdAt : undefined),
  });
  if (me.data && me.data.role !== "owner") return <div className="p-6">{t("ui.auditOwnerOnly")}</div>;
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-1 text-xl font-semibold">{t("ui.auditTitle")}</h1>
      <p className="mb-3 text-sm text-tinta-2">{t("ui.auditIntro")}</p>
      <div className="mb-3 w-56">
        <Select
          aria-label={t("ui.auditFilter")}
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          options={ENTITIES.map((e) => ({ value: e, label: e ? tk(`ui.auditEntity_${e}`) : t("ui.auditAll") }))}
        />
      </div>
      {q.isPending && me.data?.role === "owner" && <Spinner />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && !rows.length && <Empty>{t("ui.auditEmpty")}</Empty>}
      <AuditList rows={rows} />
      {q.hasNextPage && (
        <div className="mt-3">
          <Button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {t("ui.auditMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
