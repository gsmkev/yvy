/** Foto de la factura o el ticket de un movimiento o un costo (E-37): adjuntar, ver y quitar. */
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../../lib/api";
import { t } from "../../lib/i18n";
import { compressPhoto } from "../../lib/photo";
import { toast } from "../ui";
import { RowMenu } from "./adminSlot";

export type PhotoKind = "stock-moves" | "cost-entries" | "purchases" | "cattle-deals";

function usePhoto(kind: PhotoKind, id: string) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const base = `/org/erp/photos/${kind}/${id}`;
  const refresh = () => qc.invalidateQueries({ queryKey: ["erp"] });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const blob = await compressPhoto(file);
      const { url } = await post<{ url: string }>(`${base}/upload-url`);
      const put = await fetch(url, { method: "PUT", body: blob, headers: { "content-type": "image/webp" } });
      if (!put.ok) throw new Error(t("ui.photoUploadFailed"));
      await post(`${base}/uploaded`);
    },
    onSuccess: () => {
      toast(t("ui.photoSaved"));
      refresh();
    },
  });
  const view = useMutation({
    mutationFn: () => get<{ url: string }>(base),
    onSuccess: (r) => window.open(r.url, "_blank", "noopener"),
  });
  const remove = useMutation({ mutationFn: () => del(base), onSuccess: refresh });
  const input_ = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      aria-label={t("ui.photoAttach")}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) upload.mutate(f);
        e.target.value = "";
      }}
    />
  );
  return { input: input_, pick: () => input.current?.click(), upload, view, remove };
}

/** Fila de tabla con foto: un solo menú con Ver, Adjuntar o Quitar la foto, y las demás acciones de la fila. */
export function PhotoRowMenu({
  kind,
  id,
  hasPhoto,
  name,
  onEdit,
  onDelete,
}: {
  kind: PhotoKind;
  id: string;
  hasPhoto: boolean;
  name: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const p = usePhoto(kind, id);
  return (
    <>
      {p.input}
      <RowMenu
        name={name}
        onEdit={onEdit}
        onDelete={onDelete}
        extra={
          hasPhoto
            ? [
                { label: t("ui.photoView"), onSelect: () => p.view.mutate(), disabled: p.view.isPending },
                { label: t("ui.photoRemove"), onSelect: () => p.remove.mutate() },
              ]
            : [{ label: t("ui.photoAttach"), onSelect: p.pick, disabled: p.upload.isPending }]
        }
      />
    </>
  );
}

export function InvoicePhoto({ kind, id, hasPhoto }: { kind: PhotoKind; id: string; hasPhoto: boolean }) {
  const { input: hidden, pick, upload, view, remove } = usePhoto(kind, id);
  const link = "cursor-pointer underline-offset-4 hover:text-surco hover:underline";
  return (
    <span className="inline-flex gap-3 text-tinta-2">
      {hidden}
      {hasPhoto ? (
        <>
          <button className={link} disabled={view.isPending} onClick={() => view.mutate()}>
            {t("ui.photoView")}
          </button>
          <button className={`${link} hover:!text-peligro`} onClick={() => remove.mutate()}>
            {t("ui.photoRemove")}
          </button>
        </>
      ) : (
        <button className={link} disabled={upload.isPending} onClick={() => pick()}>
          {upload.isPending ? t("ui.photoUploading") : t("ui.photoAttach")}
        </button>
      )}
    </span>
  );
}
