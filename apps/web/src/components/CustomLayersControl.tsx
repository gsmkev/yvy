/** M-17: capas propias de la estancia (imágenes de dron, mapas de suelos) como capas activables con opacidad. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LIMITS } from "@yvy/shared";
import { apiFile, del, qs } from "../lib/api";
import {
  customFileMime,
  customMaxBytes,
  parseCornerInputs,
  type CustomLayer,
} from "../lib/customLayers";
import { t, tk } from "../lib/i18n";
import { Button, Field, Input, Modal, toast } from "./ui";

export type ActiveLayers = Record<string, number>; // id → opacidad 0-1

export function CustomLayersControl({
  farmId,
  layers,
  active,
  onActive,
  canManage,
  farmBounds,
}: {
  farmId: string;
  layers: CustomLayer[];
  active: ActiveLayers;
  onActive: (a: ActiveLayers) => void;
  canManage: boolean;
  farmBounds: [number, number, number, number] | null;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<CustomLayer | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/custom-layers/${id}`),
    onSuccess: (_r, id) => {
      const { [id]: _gone, ...rest } = active;
      onActive(rest);
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ["custom-layers", farmId] });
    },
    onError: (e) => toast((e as Error).message),
  });
  // Sin capas y sin permiso para subir no hay nada que mostrar
  if (layers.length === 0 && !canManage) return null;
  return (
    <div className="flex flex-col gap-2 text-xs text-lino">
      {layers.length === 0 && <p className="text-lino/70">{t("ui.customLayersNone")}</p>}
      <ul className="flex flex-col gap-2">
        {layers.map((l) => {
          const on = l.id in active;
          const ready = l.status === "ready";
          return (
            <li key={l.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-[#7A9A3F]"
                    checked={on}
                    disabled={!ready}
                    onChange={(e) => {
                      if (e.target.checked) onActive({ ...active, [l.id]: 0.7 });
                      else {
                        const { [l.id]: _off, ...rest } = active;
                        onActive(rest);
                      }
                    }}
                  />
                  <span className="truncate">{l.name}</span>
                </label>
                {canManage && (
                  <button
                    className="cursor-pointer text-lino/70 underline-offset-4 hover:text-lino hover:underline"
                    onClick={() => setRemoving(l)}
                  >
                    {t("ui.customLayersDelete")}
                  </button>
                )}
              </div>
              {l.status === "processing" && <p className="pl-6 text-lino/70">{t("ui.customLayersProcessing")}</p>}
              {l.status === "failed" && <p className="pl-6 text-lino/70">{t("ui.customLayersFailed")}</p>}
              {on && (
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={active[l.id]}
                  aria-label={t("ui.customLayersOpacity", { name: l.name })}
                  onChange={(e) => onActive({ ...active, [l.id]: Number(e.target.value) })}
                  className="ml-6 accent-[#7A9A3F]"
                />
              )}
            </li>
          );
        })}
      </ul>
      {canManage && (
        <button
          className="cursor-pointer self-start font-medium underline-offset-4 hover:underline"
          onClick={() => setAdding(true)}
        >
          {t("ui.customLayersAdd")}
        </button>
      )}
      {adding && <UploadModal farmId={farmId} farmBounds={farmBounds} onClose={() => setAdding(false)} />}
      {removing && (
        <Modal title={t("ui.customLayersDelete")} onClose={() => setRemoving(null)}>
          <p className="text-sm">{t("ui.customLayersDeleteAsk", { name: removing.name })}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setRemoving(null)}>{t("ui.cancel")}</Button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(removing.id)}>
              {t("ui.customLayersDelete")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function UploadModal({
  farmId,
  farmBounds,
  onClose,
}: {
  farmId: string;
  farmBounds: [number, number, number, number] | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [corners, setCorners] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const mime = file ? customFileMime(file) : null;
  const needsCorners = mime === "image/png" || mime === "image/jpeg";

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !mime) throw new Error(t("ui.customLayersBadType"));
      if (file.size > customMaxBytes(mime)) throw new Error(t("ui.customLayersTooBig"));
      const parsed = needsCorners ? parseCornerInputs(corners) : null;
      if (needsCorners && !parsed) throw new Error(t("ui.customLayersBadCorners"));
      const typed = file.type === mime ? file : new File([file], file.name, { type: mime });
      return apiFile<{ id: string; status: string }>(
        `/org/farms/${farmId}/custom-layers${qs({ name: name.trim() || file.name.slice(0, LIMITS.customLayers.nameMaxLength), corners: parsed ? JSON.stringify(parsed) : undefined })}`,
        typed,
      );
    },
    onSuccess: (r) => {
      toast(r.status === "processing" ? t("ui.customLayersUploadedProcessing") : t("ui.customLayersUploaded"));
      void qc.invalidateQueries({ queryKey: ["custom-layers", farmId] });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  const useFarmRect = () => {
    if (!farmBounds) return;
    const [w, s, e, n] = farmBounds;
    setCorners([`${n}, ${w}`, `${n}, ${e}`, `${s}, ${e}`, `${s}, ${w}`]);
  };

  return (
    <Modal title={t("ui.customLayersAdd")} onClose={onClose}>
      <form
        className="flex flex-col gap-4 text-surco"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          upload.mutate();
        }}
      >
        <Field label={t("ui.customLayersFile")} hint={t("ui.customLayersFileHint")}>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.tif,.tiff,image/png,image/jpeg,image/tiff"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !name) setName(f.name.replace(/\.[^.]+$/, "").slice(0, LIMITS.customLayers.nameMaxLength));
            }}
            className="text-sm"
          />
        </Field>
        <Field label={t("ui.customLayersName")}>
          <Input value={name} maxLength={LIMITS.customLayers.nameMaxLength} onChange={(e) => setName(e.target.value)} />
        </Field>
        {needsCorners && (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">{t("ui.customLayersCorners")}</legend>
            <p className="text-xs text-tinta-2">{t("ui.customLayersCornersHint")}</p>
            {[0, 1, 2, 3].map((i) => (
              <Field key={i} label={tk(`ui.customLayersCorner_${i}`)}>
                <Input
                  value={corners[i]}
                  inputMode="text"
                  placeholder="-27.2000, -55.9000"
                  onChange={(e) => setCorners((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                />
              </Field>
            ))}
            {farmBounds && (
              <button
                type="button"
                className="cursor-pointer self-start text-sm underline underline-offset-4"
                onClick={useFarmRect}
              >
                {t("ui.customLayersUseFarm")}
              </button>
            )}
          </fieldset>
        )}
        {error && (
          <p role="alert" className="text-sm text-peligro">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("ui.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={!file || upload.isPending}>
            {upload.isPending ? t("ui.customLayersUploading") : t("ui.customLayersUpload")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
