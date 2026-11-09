import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { get } from "../lib/api";
import { describeData } from "../lib/exports";
import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { fetchRecordsPage, type RecordFilters } from "../lib/queries";
import type { RecordRow } from "../lib/types";
import { Camera, ClipboardList, Clock, NotebookPen } from "lucide-react";
import { RECORD_ICON } from "../lib/icons";
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
  if (!rows.length) return <Empty icon={ClipboardList} title={t("ui.noRecords")} />;
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-linea border-y border-linea">
        {rows.map((r) => {
          const Icon = RECORD_ICON[r.kind] ?? NotebookPen;
          return (
            <li key={r.id}>
              <button
                className="flex w-full cursor-pointer items-start gap-3 py-3 text-left hover:bg-surco/[0.03]"
                onClick={() => setOpen(r)}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-soja/15 text-accion">
                  <Icon size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{tk(`recordKinds.${r.kind}`)}</span>
                    <span className="num shrink-0 text-xs text-tinta-2">{fmtDateTime(r.capturedAt)}</span>
                  </span>
                  <span className="block truncate text-sm text-tinta-2">{describeData(r.kind, r.data)}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-tinta-2">
                    {r.authorName ?? "—"}
                    {r.plotName && <span>· {r.plotName}</span>}
                    {r.attachments.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        · <Camera size={12} aria-hidden /> {r.attachments.length}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {q.hasNextPage && (
        <Button variant="quiet" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
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
  if (url === null) return <div className="aspect-square animate-pulse rounded-md bg-surco/10" />;
  if (!url)
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-trigo text-xs text-trigo-texto">
        <Clock size={16} aria-hidden /> {t("app.pending")}
      </div>
    );
  return (
    <>
      <button onClick={() => get<{ url: string }>(`/media/attachments/${id}`).then((r) => setFull(r.url))}>
        <img src={url} alt="" className="aspect-square w-full cursor-zoom-in rounded-md object-cover" />
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
      <dl className="num grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-tinta-2">{t("ui.capturedAt")}</dt>
        <dd>{fmtDateTime(r.capturedAt)}</dd>
        <dt className="text-tinta-2">{t("ui.author")}</dt>
        <dd>{r.authorName}</dd>
        {r.plotName && (
          <>
            <dt className="text-tinta-2">{t("ui.plot")}</dt>
            <dd>{r.plotName}</dd>
          </>
        )}
        {r.lat !== null && (
          <>
            <dt className="text-tinta-2">{t("ui.location")}</dt>
            <dd>
              {r.lat.toFixed(5)}, {r.lon!.toFixed(5)}
            </dd>
          </>
        )}
      </dl>
      <p className="mt-4 rounded-md border border-linea bg-papel p-3 text-sm whitespace-pre-wrap">
        {describeData(r.kind, r.data)}
      </p>
      {r.attachments.length > 0 && (
        <>
          <h3 className="eyebrow mt-5 mb-2">{t("ui.photos")}</h3>
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
