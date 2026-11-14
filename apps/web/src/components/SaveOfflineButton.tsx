import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download } from "lucide-react";
import { LIMITS } from "@yvy/shared/limits";
import { isNetworkDown, onNetworkChange } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { t } from "../lib/i18n";
import { prefetchFarmForOffline } from "../lib/offline/prefetch";
import { OfflineQuotaError, planFarm } from "../lib/offline/tilePlan";
import { canSaveOffline, removeFarm, savedFarms, savedSnapshot, saveFarm, subscribeSaved, type Progress } from "../lib/offline/tiles";
import type { FarmDetail } from "../lib/types";
import { Button, ErrorBox, Modal } from "./ui";

const mb = (bytes: number) => Math.max(1, Math.round(bytes / (1024 * 1024))).toLocaleString("es-PY");

/** "Guardar esta estancia para usar sin conexión": mapa base, último NDVI y fondo del país hasta un zoom medio. */
export function SaveOfflineButton({ detail, tilesBaseUrl }: { detail: FarmDetail; tilesBaseUrl: string | undefined }) {
  const qc = useQueryClient();
  const saved = useSyncExternalStore(subscribeSaved, savedSnapshot)[detail.farm.id];
  const offline = useSyncExternalStore(onNetworkChange, isNetworkDown);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<unknown>(null);
  const abort = useRef<AbortController | null>(null);
  const plan = useMemo(() => (tilesBaseUrl ? planFarm(detail, tilesBaseUrl) : null), [detail, tilesBaseUrl]);

  useEffect(() => {
    void savedFarms();
  }, []);
  useEffect(() => () => abort.current?.abort(), []);

  if (!plan || !canSaveOffline()) return null;

  const run = async () => {
    setError(null);
    setConfirming(false);
    const ctl = (abort.current = new AbortController());
    setProgress({ doneBytes: 0, totalBytes: plan.estimateBytes });
    try {
      await saveFarm(plan, { onProgress: setProgress, signal: ctl.signal });
      // Los datos de la estancia también: lotes, tareas y registros quedan en la copia de lecturas.
      await prefetchFarmForOffline(qc, detail.farm.id);
    } catch (e) {
      if (!ctl.signal.aborted) setError(e);
    } finally {
      setProgress(null);
    }
  };

  if (progress) {
    const pct = progress.totalBytes ? Math.round((progress.doneBytes / progress.totalBytes) * 100) : 0;
    return (
      <div className="mt-2 flex items-center gap-3 text-sm text-tinta-2" role="status">
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t("offline.saving", { pct })}
          className="h-1.5 w-40 overflow-hidden rounded-full bg-linea"
        >
          <span className="block h-full bg-soja" style={{ width: `${pct}%` }} />
        </span>
        {t("offline.saving", { pct })}
        <Button variant="quiet" onClick={() => abort.current?.abort()}>
          {t("ui.cancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-2">
      {saved ? (
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-tinta-2">
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} className="text-soja" aria-hidden />
            {t("offline.savedOn", { date: fmtDateTime(saved.savedAt) })}
          </span>
          <button className="cursor-pointer underline underline-offset-4 hover:text-surco disabled:opacity-45" disabled={offline} onClick={() => setConfirming(true)}>
            {t("offline.refresh")}
          </button>
          <button className="cursor-pointer underline underline-offset-4 hover:text-surco" onClick={() => void removeFarm(detail.farm.id)}>
            {t("offline.remove")}
          </button>
        </p>
      ) : (
        <Button variant="secondary" icon={undefined} disabled={offline} onClick={() => setConfirming(true)} title={offline ? t("offline.needsConnection") : undefined}>
          <Download size={16} aria-hidden />
          {t("offline.saveFarm")}
        </Button>
      )}
      {error ? (
        error instanceof OfflineQuotaError ? (
          <p role="alert" className="text-sm text-peligro">
            {t("offline.overLimit", { mb: mb(LIMITS.webOffline.mapMaxBytes) })}
          </p>
        ) : (
          <ErrorBox error={error} />
        )
      ) : null}
      {confirming && (
        <Modal title={t("offline.saveTitle")} onClose={() => setConfirming(false)}>
          <div className="flex flex-col gap-3 text-[15px]">
            <p>{t("offline.saveSize", { mb: mb(plan.estimateBytes) })}</p>
            {plan.files.length === 0 && <p className="text-sm text-tinta-2">{t("offline.saveNoImagery")}</p>}
            <p className="text-sm text-tinta-2">{t("offline.saveNotice")}</p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => void run()}>
                {t("offline.saveAction")}
              </Button>
              <Button variant="quiet" onClick={() => setConfirming(false)}>
                {t("ui.cancel")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
