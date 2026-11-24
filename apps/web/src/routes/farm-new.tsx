/** Alta de una estancia: nombre, ubicación en el mapa o desde un archivo de lotes. */
import { PenLine, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Polygon } from "geojson";
import { areaHa, bboxOf } from "@yvy/geo";
import { LIMITS } from "@yvy/shared";
import { FarmMap } from "../components/FarmMap";
import { useMe } from "../lib/queries";
import { Button, ErrorBox, Field, Form, Input } from "../components/ui";
import { post } from "../lib/api";
import { fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { PlaceSearch } from "./farm-new/PlaceSearch";
import { combineAreas, parseFile, type ImportedPolygon } from "../lib/importGeo";
import type { Area } from "../lib/types";

/** Pantalla para crear una estancia, con la opción de importar sus lotes en el mismo paso. */
export function NewFarmPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [district, setDistrict] = useState("");
  // Partes del perímetro: varias figuras forman un MultiPolygon (cascos separados).
  const [parts, setParts] = useState<Area[]>([]);
  const geometry = useMemo(() => combineAreas(parts), [parts]);
  const [fileOptions, setFileOptions] = useState<ImportedPolygon[] | null>(null);
  // Los demás polígonos del archivo, para importarlos como lotes en el mismo paso.
  const [withPlots, setWithPlots] = useState(true);
  const filePlots = (fileOptions ?? [])
    .slice(1)
    .filter(
      (p) => p.areaHa >= LIMITS.geometry.minPlotHa && parts.length === 1 && parts[0] === fileOptions![0]!.geometry,
    );
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; zoom?: number; n: number } | null>(null);
  const goTo = (lon: number, lat: number, zoom?: number) => setFlyTo((f) => ({ lon, lat, zoom, n: (f?.n ?? 0) + 1 }));

  const onFile = async (file: File) => {
    setError(null);
    try {
      const polys = (await parseFile(file)).filter((p) => !p.error).sort((a, b) => b.areaHa - a.areaHa);
      if (!polys.length) throw new Error(t("ui.import.errors", { count: 1 }));
      if (polys.length === 1) {
        setParts([polys[0]!.geometry]);
        setFileOptions(null);
      } else {
        // Varios polígonos: el más grande como perímetro, o todos como partes de la estancia.
        setParts([polys[0]!.geometry]);
        setFileOptions(polys);
      }
    } catch (e) {
      setError(e);
    }
  };

  const save = async () => {
    if (!geometry) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ id: string }>("/org/farms", {
        name,
        department: department || null,
        district: district || null,
        geometry,
      });
      if (withPlots && filePlots.length) {
        for (let i = 0; i < filePlots.length; i += 40) {
          await post(`/org/farms/${r.id}/plots`, {
            plots: filePlots.slice(i, i + 40).map((p) => ({ name: p.name, kind: "crop", geometry: p.geometry })),
          });
        }
      }
      await qc.invalidateQueries({ queryKey: ["farms"] });
      navigate({ to: "/estancias/$farmId", params: { farmId: r.id } });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

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
            setParts((prev) => [...prev, g]);
            setFileOptions(null);
            setDrawing(false);
          }}
        />
      </div>
      <Form className="flex flex-col gap-3 overflow-auto p-4 *:shrink-0" onSubmit={() => save()}>
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
        <div className="flex flex-wrap gap-2">
          <Button icon={drawing ? X : PenLine} onClick={() => setDrawing(!drawing)}>
            {drawing ? t("ui.common.cancel") : parts.length ? t("ui.add.part") : t("ui.common.draw")}
          </Button>
          {parts.length > 0 && !drawing && (
            <Button
              variant="quiet"
              onClick={() => {
                setParts([]);
                setFileOptions(null);
              }}
            >
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
        {fileOptions && (
          <div className="flex flex-col gap-2 border-b border-linea pb-3 text-sm">
            <p>{t("ui.common.fileHasMany", { count: fileOptions.length })}</p>
            {filePlots.length > 0 && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={withPlots} onChange={(e) => setWithPlots(e.target.checked)} />
                {t("ui.common.alsoImportPlots", { count: filePlots.length })}
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setParts(fileOptions.map((p) => p.geometry))}>{t("ui.use.allAsParts")}</Button>
            </div>
          </div>
        )}
        {geometry && (
          <p className="text-sm">
            {t("ui.common.area")}: <strong>{fmtHa(areaHa(geometry))}</strong>
            {parts.length > 1 || geometry.type === "MultiPolygon"
              ? " · " + t("ui.farm.parts", { count: geometry.coordinates.length })
              : ""}
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
