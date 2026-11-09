import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { get } from "../lib/api";
import { describeData } from "../lib/exports";
import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { fetchRecordsPage, type RecordFilters } from "../lib/queries";
import type { RecordRow } from "../lib/types";
import { Button, Empty, ErrorBox, Modal, Spinner } from "./ui";

export function useRecords(filters: RecordFilters) {
  return useInfiniteQuery({
    queryKey: ["records", filters],
    queryFn: ({ pageParam }) => fetchRecordsPage(filters, pageParam),
    initialPageParam: null as { capturedAt: number; id: string } | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function RecordsList({ filters, onRows }: { filters: RecordFilters; onRows?: (rows: RecordRow[]) => void }) {
  const q = useRecords(filters);
  const [open, setOpen] = useState<RecordRow | null>(null);
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  useEffect(() => onRows?.(rows), [q.data]);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!rows.length) return <Empty>{t("ui.noRecords")}</Empty>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-surco/10 rounded-xl bg-white">
        {rows.map((r) => (
          <li key={r.id}>
            <button className="flex w-full items-start gap-3 p-3 text-left hover:bg-lino/60" onClick={() => setOpen(r)}>
              <span className="mt-0.5 inline-block min-w-24 rounded-md bg-soja/15 px-2 py-0.5 text-xs font-semibold text-soja-dark">
                {tk(`recordKinds.${r.kind}`)}
              </span>
              <span className="flex-1 text-sm">
                <span className="block">{describeData(r.kind, r.data)}</span>
                <span className="block text-xs text-surco/60">
                  {fmtDateTime(r.capturedAt)} · {r.authorName ?? "—"}
                  {r.plotName ? ` · ${r.plotName}` : ""}
                  {r.attachments.length ? ` · 📷 ${r.attachments.length}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <Button variant="ghost" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {t("ui.loadMore")}
        </Button>
      )}
      {open && <RecordModal record={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Photo({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [full, setFull] = useState<string | null>(null);
  useEffect(() => {
    get<{ url: string }>(`/media/attachments/${id}?thumb=1`).then(
      (r) => setUrl(r.url),
      () => setUrl(""),
    );
  }, [id]);
  if (url === null) return <div className="aspect-square animate-pulse rounded-lg bg-surco/10" />;
  if (!url)
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-trigo text-xs text-surco/60">
        ⏳
      </div>
    );
  return (
    <>
      <button onClick={() => get<{ url: string }>(`/media/attachments/${id}`).then((r) => setFull(r.url))}>
        <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
      </button>
      {full && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setFull(null)}
        >
          <img src={full} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </>
  );
}

export function RecordModal({ record: r, onClose }: { record: RecordRow; onClose: () => void }) {
  return (
    <Modal title={tk(`recordKinds.${r.kind}`)} onClose={onClose}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-surco/60">{t("ui.capturedAt")}</dt>
        <dd>{fmtDateTime(r.capturedAt)}</dd>
        <dt className="text-surco/60">{t("ui.author")}</dt>
        <dd>{r.authorName}</dd>
        {r.plotName && (
          <>
            <dt className="text-surco/60">{t("ui.plot")}</dt>
            <dd>{r.plotName}</dd>
          </>
        )}
        {r.lat !== null && (
          <>
            <dt className="text-surco/60">{t("ui.location")}</dt>
            <dd>
              {r.lat.toFixed(5)}, {r.lon!.toFixed(5)}
            </dd>
          </>
        )}
      </dl>
      <p className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm">{describeData(r.kind, r.data)}</p>
      {r.attachments.length > 0 && (
        <>
          <h3 className="mb-2 mt-4 text-sm font-semibold">{t("ui.photos")}</h3>
          <div className="grid grid-cols-3 gap-2">
            {r.attachments.map((a) => (
              <Photo key={a.id} id={a.id} />
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
