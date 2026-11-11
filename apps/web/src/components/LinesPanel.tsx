import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LineString } from "geojson";
import { LINE_KINDS, type LineKind } from "@yvy/shared";
import { del, post } from "../lib/api";
import { fmtDistance, pathLengthM } from "../lib/measure";
import { t, tk } from "../lib/i18n";
import type { FarmLine } from "../lib/types";
import { deleteWithUndo } from "../lib/undo";
import { Button, ErrorBox, Field, Input, Modal, Select, toast } from "./ui";

/** M-20: alambrados, caminos internos y cañerías de la estancia, con su largo. */
export function LinesPanel({
  farmId,
  lines,
  canEdit,
  onDraw,
}: {
  farmId: string;
  lines: FarmLine[];
  canEdit: boolean;
  onDraw: () => void;
}) {
  const qc = useQueryClient();
  const remove = (l: FarmLine) =>
    deleteWithUndo({
      qc,
      id: l.id,
      message: t("ui.lineDeleted"),
      hide: () => qc.setQueryData<FarmLine[]>(["lines", farmId], (x) => x?.filter((y) => y.id !== l.id)),
      request: () => del(`/org/lines/${l.id}`),
      invalidate: [["lines", farmId]],
    });
  const total = lines.reduce((a, l) => a + l.lengthM, 0);
  return (
    <section aria-labelledby="lines-title">
      <div className="mb-2 flex items-end justify-between gap-3 border-b border-linea pb-2">
        <h3 id="lines-title" className="eyebrow">
          {t("ui.linesTitle")}
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={onDraw}
            className="cursor-pointer text-sm font-medium text-accion underline underline-offset-4 print:hidden"
          >
            {t("ui.linesAdd")}
          </button>
        )}
      </div>
      {lines.length === 0 ? (
        <p className="py-2 text-sm text-tinta-2">{t("ui.linesNone")}</p>
      ) : (
        <>
          <ul className="text-sm">
            {lines.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3 border-b border-linea py-2">
                <span>
                  {l.name}
                  <span className="ml-2 text-xs text-tinta-2">{tk(`ui.lineKind_${l.kind}`)}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="num text-xs text-tinta-2">{fmtDistance(l.lengthM)}</span>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`${t("ui.delete")} ${l.name}`}
                      className="cursor-pointer text-xs text-tinta-2 hover:text-peligro print:hidden"
                      onClick={() => remove(l)}
                    >
                      {t("ui.delete")}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="num mt-2 text-xs text-tinta-2">{t("ui.linesTotal", { len: fmtDistance(total) })}</p>
        </>
      )}
    </section>
  );
}

/** Nombre y tipo de la línea recién trazada. */
export function NewLineModal({
  farmId,
  line,
  onClose,
}: {
  farmId: string;
  line: LineString;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<LineKind>("fence");
  const [name, setName] = useState("");
  const length = pathLengthM(line.coordinates as [number, number][], false);
  const save = useMutation({
    mutationFn: () => post(`/org/farms/${farmId}/lines`, { kind, name: name.trim(), geometry: line }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lines", farmId] });
      toast(t("ui.lineSaved"));
      onClose();
    },
  });
  return (
    <Modal title={t("ui.linesAdd")} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <Field label={t("ui.lineKind")}>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as LineKind)}
            options={LINE_KINDS.map((k) => ({ value: k, label: tk(`ui.lineKind_${k}`) }))}
          />
        </Field>
        <Field label={t("ui.lineName")} hint={t("ui.lineLength", { len: fmtDistance(length) })}>
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        {save.error ? <ErrorBox error={save.error} /> : null}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={!name.trim() || save.isPending}>
            {t("ui.lineSave")}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
