import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { get } from "../lib/api";
import { describeData } from "../lib/exports";
import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { isAudioMime, recordShareText } from "@yvy/shared";
import { fetchRecordsPage, useFarms, useMe, type RecordFilters } from "../lib/queries";
import type { RecordRow } from "../lib/types";
import { Clock } from "lucide-react";
import { DeleteRecordConfirm, RecordEditForm } from "./RecordEdit";
import { RecordDetails } from "./RecordDetails";
import { ShareWhatsappButton } from "./ShareButton";
import { StationsView, stationsOf } from "./StationsView";
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
  if (q.isLoading) return <Spinner rows={6} h={68} />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!rows.length) return <Empty title={t("ui.noRecords")} />;
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-linea border-y border-linea">
        {rows.map((r) => {
          return (
            <li key={r.id}>
              <button
                className="flex w-full cursor-pointer items-start gap-3 py-3.5 text-left hover:bg-surco/[0.03]"
                onClick={() => setOpen(r)}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[15px] font-medium">{describeData(r.kind, r.data)}</span>
                    <span className="num shrink-0 text-xs text-tinta-2">{fmtDateTime(r.capturedAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-sm text-tinta-2">
                    {tk(`recordKinds.${r.kind}`)} · {r.authorName ?? "—"}
                    {r.plotName && <span>· {r.plotName}</span>}
                    {photosOf(r).length > 0 && (
                      <span>
                        · {t(photosOf(r).length === 1 ? "ui.photoOne" : "ui.photosMany", { n: photosOf(r).length })}
                      </span>
                    )}
                    {voiceOf(r).length > 0 && <span>· {t("app.voiceNote")}</span>}
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

const photosOf = (r: RecordRow) => r.attachments.filter((a) => !isAudioMime(a.mime ?? ""));
const voiceOf = (r: RecordRow) => r.attachments.filter((a) => isAudioMime(a.mime ?? ""));

/** Nota de voz (F-09): se pide la URL firmada al tocar "Escuchar", no al abrir el registro. */
function VoiceNote({ id, uploaded }: { id: string; uploaded: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (!uploaded)
    return (
      <p className="flex items-center gap-1 text-sm text-trigo-texto">
        <Clock size={16} aria-hidden /> {t("app.pending")}
      </p>
    );
  if (url)
    return (
      <audio controls autoPlay src={url} className="w-full" aria-label={t("app.voiceNote")}>
        {t("app.voiceNote")}
      </audio>
    );
  return (
    <>
      <Button
        variant="quiet"
        onClick={() =>
          get<{ url: string }>(`/media/attachments/${id}`).then(
            (r) => setUrl(r.url),
            () => setFailed(true),
          )
        }
      >
        {t("app.voiceListen")}
      </Button>
      {failed && <p className="text-sm text-alerta">{t("app.voiceFailed")}</p>}
    </>
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
  const me = useMe();
  const farms = useFarms();
  const canEdit = !!me.data && me.data.role !== "worker";
  const shareText = recordShareText({
    kindLabel: tk(`recordKinds.${r.kind}`),
    description: describeData(r.kind, r.data),
    plotName: r.plotName,
    farmName: farms.data?.find((f) => f.id === r.farmId)?.name,
    when: fmtDateTime(r.capturedAt),
    lat: r.lat,
    lon: r.lon,
  });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
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
        {editing ? (
          <div className="mt-4 border-t border-linea pt-4">
            <RecordEditForm record={r} onDone={onClose} onCancel={() => setEditing(false)} />
          </div>
        ) : (
          <p className="mt-4 border-y border-linea py-3 text-sm whitespace-pre-wrap">{describeData(r.kind, r.data)}</p>
        )}
        {!editing && stationsOf(r.data) && <StationsView data={r.data} />}
        {!editing && <RecordDetails kind={r.kind} data={r.data} />}
        {photosOf(r).length > 0 && (
          <>
            <h3 className="eyebrow mt-5 mb-2">{t("ui.photos")}</h3>
            <div className="grid grid-cols-3 gap-2">
              {photosOf(r).map((a) => (
                <Photo key={a.id} id={a.id} />
              ))}
            </div>
          </>
        )}
        {voiceOf(r).length > 0 && (
          <>
            <h3 className="eyebrow mt-5 mb-2">{t("app.voiceNote")}</h3>
            {voiceOf(r).map((a) => (
              <VoiceNote key={a.id} id={a.id} uploaded={a.uploadStatus === "uploaded"} />
            ))}
          </>
        )}
        {!editing && (
          <div className="mt-5">
            <ShareWhatsappButton text={shareText} />
          </div>
        )}
        {canEdit && !editing && (
          <div className="mt-5 flex gap-2 border-t border-linea pt-4">
            <Button onClick={() => setEditing(true)}>{t("ui.edit")}</Button>
            <Button variant="danger" onClick={() => setDeleting(true)}>
              {t("ui.delete")}
            </Button>
          </div>
        )}
      </Modal>
      {deleting && <DeleteRecordConfirm record={r} onDone={onClose} onClose={() => setDeleting(false)} />}
    </>
  );
}
