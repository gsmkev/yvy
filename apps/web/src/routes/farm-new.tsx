/** Alta de una estancia: nombre, ubicación en el mapa o desde un archivo de lotes. */
import { PenLine, Upload, X } from "lucide-react";
import { useState } from "react";
import type { Polygon } from "geojson";
import { areaHa, bboxOf } from "@yvy/geo";
import { FarmMap } from "../components/FarmMap";
import { useMe } from "../lib/queries";
import { Button, ErrorBox, Field, Form, Input } from "../components/ui";
import { fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { PlaceSearch } from "./farm-new/PlaceSearch";
import { usePerimeter } from "./farm-new/usePerimeter";
import { useSaveFarm } from "./farm-new/useSaveFarm";

/** Opciones cuando el archivo trae varios polígonos: importar los lotes o usar todos como partes. */
function FileOptions({
  fileOptions,
  plotCount,
  withPlots,
  onWithPlots,
  onAllAsParts,
}: {
  fileOptions: { geometry: unknown }[];
  plotCount: number;
  withPlots: boolean;
  onWithPlots: (v: boolean) => void;
  onAllAsParts: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-linea pb-3 text-sm">
      <p>{t("ui.common.fileHasMany", { count: fileOptions.length })}</p>
      {plotCount > 0 && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={withPlots} onChange={(e) => onWithPlots(e.target.checked)} />
          {t("ui.common.alsoImportPlots", { count: plotCount })}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAllAsParts}>{t("ui.use.allAsParts")}</Button>
      </div>
    </div>
  );
}

/** Botones del perímetro: dibujar (o agregar otra parte), empezar de nuevo e importar un archivo. */
function PerimeterButtons({
  drawing,
  hasParts,
  onToggleDraw,
  onReset,
  onFile,
}: {
  drawing: boolean;
  hasParts: boolean;
  onToggleDraw: () => void;
  onReset: () => void;
  onFile: (file: File) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button icon={drawing ? X : PenLine} onClick={onToggleDraw}>
        {drawing ? t("ui.common.cancel") : hasParts ? t("ui.add.part") : t("ui.common.draw")}
      </Button>
      {hasParts && !drawing && (
        <Button variant="quiet" onClick={onReset}>
          {t("ui.common.startOver")}
        </Button>
      )}
      <label className="cursor-pointer">
        <span className="inline-flex h-10 items-center gap-2 rounded-md border border-linea bg-papel px-3.5 text-sm font-medium hover:bg-lino">
          <Upload size={16} aria-hidden />
          {t("ui.import.short")}
        </span>
        <input
          type="file"
          accept=".kml,.kmz,.geojson,.json,.zip"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>
    </div>
  );
}

/** Pantalla para crear una estancia, con la opción de importar sus lotes en el mismo paso. */
export function NewFarmPage() {
  const me = useMe();
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [district, setDistrict] = useState("");
  const { parts, setParts, geometry, fileOptions, withPlots, setWithPlots, filePlots, error, setError, onFile, addPart, reset } =
    usePerimeter();
  const [drawing, setDrawing] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; zoom?: number; n: number } | null>(null);
  const goTo = (lon: number, lat: number, zoom?: number) => setFlyTo((f) => ({ lon, lat, zoom, n: (f?.n ?? 0) + 1 }));

  const { busy, save } = useSaveFarm(setError);

  const b = geometry ? bboxOf(geometry) : null;
  return (
    <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="h-96 lg:h-full">
        <FarmMap
          outline={geometry ? JSON.stringify(geometry) : null}
          tilesBaseUrl={me.data?.tilesBaseUrl}
          bounds={b ? [b.minLon, b.minLat, b.maxLon, b.maxLat] : null}
          flyTo={flyTo}
          drawing={drawing}
          onDrawn={(g: Polygon) => {
            addPart(g);
            setDrawing(false);
          }}
        />
      </div>
      <Form className="flex flex-col gap-3 overflow-auto p-4 *:shrink-0" onSubmit={() => save({ name, department, district, geometry, plots: withPlots ? filePlots : [] })}>
        <h1 className="text-xl font-semibold">{t("ui.new.farm")}</h1>
        <Field label={t("ui.farm.name")}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.common.department")}>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </Field>
          <Field label={t("ui.common.district")}>
            <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
          </Field>
        </div>
        <PlaceSearch
          onGoTo={goTo}
          onPlace={(p) => {
            setDepartment((d) => d || p.department);
            if (p.kind === "city") setDistrict((d) => d || p.name);
          }}
        />
        <p className="text-sm text-tinta-2">{t("ui.draw.farm")}</p>
        <PerimeterButtons
          drawing={drawing}
          hasParts={parts.length > 0}
          onToggleDraw={() => setDrawing(!drawing)}
          onReset={reset}
          onFile={onFile}
        />
        {fileOptions && (
          <FileOptions
            fileOptions={fileOptions}
            plotCount={filePlots.length}
            withPlots={withPlots}
            onWithPlots={setWithPlots}
            onAllAsParts={() => setParts(fileOptions.map((p) => p.geometry))}
          />
        )}
        {geometry && (
          <p className="text-sm">
            {t("ui.common.area")}: <strong>{fmtHa(areaHa(geometry))}</strong>
            {parts.length > 1 || geometry.type === "MultiPolygon" ? ", " + t("ui.farm.parts", { count: geometry.coordinates.length }) : ""}
          </p>
        )}
        {error ? <ErrorBox error={error} /> : null}
        <Button type="submit" variant="primary" disabled={!geometry || !name || busy}>
          {t("ui.common.save")}
        </Button>
        {!busy && (!name || !geometry) && (
          <p className="-mt-2 text-meta text-tinta-2">{[!name && t("ui.farm.needName"), !geometry && t("ui.farm.needPerimeter")].filter(Boolean).join(" ")}</p>
        )}
      </Form>
    </div>
  );
}
