/** Diálogos y barra del mapa de la estancia: alta de lote y de punto de interés, y guardado de la edición de vértices. */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { MultiPolygon, Polygon } from "geojson";
import { areaHa, validatePolygon } from "@yvy/geo";
import { POI_KINDS } from "@yvy/shared";
import { Button, ErrorBox, Field, Form, Input, Modal, Select, toast } from "../../components/ui";
import { patch, post } from "../../lib/api";
import { fmtHa } from "../../lib/format";
import { t, tk } from "../../lib/i18n";

/**
 * Alta de un lote con la geometría dibujada.
 * @param onSaved se llama al guardar.
 */
export function NewPlotModal({
  farmId,
  geometry,
  onClose,
  onSaved,
}: {
  farmId: string;
  geometry: Polygon;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"crop" | "pasture">("crop");
  const save = useMutation({
    mutationFn: () => post(`/org/farms/${farmId}/plots`, { plots: [{ name, kind, geometry }] }),
    onSuccess: () => {
      toast(t("ui.toast.plotSaved"));
      onSaved();
      onClose();
    },
  });
  return (
    <Modal title={t("ui.new.plot")} onClose={onClose}>
      <Form className="flex flex-col gap-4" onSubmit={() => save.mutate()}>
        <p className="text-sm">
          {t("ui.common.area")}: <strong className="num">{fmtHa(areaHa(geometry))}</strong>
        </p>
        <Field label={t("ui.common.plot")}>
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("ui.plot.kind")}>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as "crop")}
            options={[
              { value: "crop", label: t("ui.common.crop") },
              { value: "pasture", label: t("ui.common.pasture") },
            ]}
          />
        </Field>
        {save.error && <ErrorBox error={save.error} />}
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("ui.common.save")}
        </Button>
      </Form>
    </Modal>
  );
}

/** Barra de la edición de vértices: superficie en vivo, validación completa (Turf) y guardado por PATCH. */
export function ShapeEditBar({
  plotId,
  original,
  shape,
  onDone,
  onSaved,
}: {
  plotId: string;
  original: string;
  shape: Polygon | MultiPolygon | null;
  onDone: () => void;
  onSaved: () => void;
}) {
  const problem = shape ? validatePolygon(shape) : null;
  const save = useMutation({
    mutationFn: () =>
      patch<{ areaHa: number; warnings: { kind: "overlap" | "outside"; plotName?: string }[] }>(
        `/org/plots/${plotId}`,
        { geometry: shape },
      ),
    onSuccess: (r) => {
      onSaved();
      toast(t("ui.plot.shapeSaved", { area: fmtHa(r.areaHa) }));
      for (const w of r.warnings)
        toast(
          w.kind === "overlap" ? t("ui.plot.shapeOverlap", { name: w.plotName ?? "" }) : t("ui.plot.shapeOutside"),
          { ms: 6000 },
        );
      onDone();
    },
  });
  const area = areaHa(shape ?? (JSON.parse(original) as Polygon | MultiPolygon));
  return (
    <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col gap-2 rounded-md bg-surco px-4 py-3 text-sm text-lino">
      <p>{t("ui.plot.editHint")}</p>
      <p className="num">
        {t("ui.common.area")}: <strong className="font-semibold">{fmtHa(area)}</strong>
        {shape && <span className="text-lino/70"> · {t("ui.plot.editWas", { area: fmtHa(areaHa(JSON.parse(original) as Polygon | MultiPolygon)) })}</span>}
      </p>
      {problem && <p className="font-medium text-trigo">{tk(`ui.geom.error_${problem}`)}</p>}
      {save.error && <p className="font-medium text-trigo">{save.error instanceof Error ? save.error.message : String(save.error)}</p>}
      <div className="flex gap-4 font-medium">
        <button
          className="cursor-pointer underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          disabled={!shape || !!problem || save.isPending}
          onClick={() => save.mutate()}
        >
          {t("ui.plot.editSave")}
        </button>
        <button className="cursor-pointer underline-offset-4 hover:underline" onClick={onDone}>
          {t("ui.common.cancel")}
        </button>
      </div>
    </div>
  );
}

/**
 * Alta de un punto de interés en la posición elegida.
 * @param at [longitud, latitud].
 * @param onSaved se llama al guardar.
 */
export function NewPoiModal({
  farmId,
  at,
  onClose,
  onSaved,
}: {
  farmId: string;
  at: [number, number];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("rain_gauge");
  const save = useMutation({
    mutationFn: () => post(`/org/farms/${farmId}/pois`, { name, kind, lon: at[0], lat: at[1] }),
    onSuccess: () => {
      toast(t("ui.toast.poiSaved"));
      onSaved();
      onClose();
    },
  });
  return (
    <Modal title={t("ui.add.poi")} onClose={onClose}>
      <Form className="flex flex-col gap-4" onSubmit={() => save.mutate()}>
        <Field label={t("ui.common.kind")}>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            options={POI_KINDS.map((k) => ({ value: k, label: tk(`ui.poi.kinds_${k}`) }))}
          />
        </Field>
        <Field label={t("ui.common.name")}>
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {save.error && <ErrorBox error={save.error} />}
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("ui.common.save")}
        </Button>
      </Form>
    </Modal>
  );
}
