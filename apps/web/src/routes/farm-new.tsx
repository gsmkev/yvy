import { PenLine, Upload, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Polygon } from "geojson";
import { areaHa, bboxOf } from "@yvy/geo";
import { FarmMap } from "../components/FarmMap";
import { Button, ErrorBox, Field, Input } from "../components/ui";
import { post } from "../lib/api";
import { fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { parseLocation } from "../lib/coords";
import { parseFile } from "../lib/importGeo";
import { searchPlaces, type Place } from "../lib/places-py";
import type { Area } from "../lib/types";

export function NewFarmPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [district, setDistrict] = useState("");
  const [geometry, setGeometry] = useState<Area | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; zoom?: number; n: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [place, setPlace] = useState("");
  const found = searchPlaces(place);
  const coords = parseLocation(place);
  const goCoords = () => {
    if (!coords) return;
    goTo(coords.lon, coords.lat, 16);
    setPlace("");
  };
  const pickPlace = (p: Place) => {
    goTo(p.lon, p.lat, p.zoom);
    setPlace("");
    setDepartment((d) => d || p.department);
    if (p.kind === "city") setDistrict((d) => d || p.name);
  };

  const goTo = (lon: number, lat: number, zoom?: number) => setFlyTo((f) => ({ lon, lat, zoom, n: (f?.n ?? 0) + 1 }));
  const useMyLocation = () => {
    setGeoMsg(null);
    if (!("geolocation" in navigator)) return setGeoMsg(t("ui.geoUnsupported"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        goTo(p.coords.longitude, p.coords.latitude, 15);
      },
      (e) => {
        setLocating(false);
        setGeoMsg(e.code === e.PERMISSION_DENIED ? t("ui.geoDenied") : t("ui.geoFailed"));
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const onFile = async (file: File) => {
    setError(null);
    try {
      const polys = (await parseFile(file)).filter((p) => !p.error);
      if (!polys.length) throw new Error(t("ui.importErrors", { count: 1 }));
      // El polígono más grande es el perímetro
      setGeometry(polys.sort((a, b) => b.areaHa - a.areaHa)[0]!.geometry);
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
          bounds={b ? [b.minLon, b.minLat, b.maxLon, b.maxLat] : null}
          flyTo={flyTo}
          drawing={drawing}
          onDrawn={(g: Polygon) => {
            setGeometry(g);
            setDrawing(false);
          }}
        />
      </div>
      <form
        className="flex flex-col gap-3 overflow-auto p-4 *:shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h1 className="text-xl font-semibold">{t("ui.newFarm")}</h1>
        <Field label={t("ui.farmName")}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.department")}>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </Field>
          <Field label={t("ui.district")}>
            <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <Field label={t("ui.placeSearch")}>
            <Input
              value={place}
              placeholder={t("ui.placeSearchPlaceholder")}
              onChange={(e) => setPlace(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (coords) goCoords();
                else if (found[0]) pickPlace(found[0]);
              }}
            />
          </Field>
          {place.trim().length >= 2 && (
            <ul className="rounded-md border border-linea bg-papel">
              {coords && (
                <li className="border-b border-linea last:border-0">
                  <button
                    type="button"
                    onClick={goCoords}
                    className="flex w-full cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surco/[0.05]"
                  >
                    <span className="font-medium">{t("ui.placeGoCoords")}</span>
                    <span className="num text-xs text-tinta-2">
                      {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
                    </span>
                  </button>
                </li>
              )}
              {!coords && found.length === 0 && <li className="px-3 py-2 text-sm text-tinta-2">{t("ui.placeNone")}</li>}
              {found.map((p) => (
                <li key={`${p.kind}${p.name}`} className="border-b border-linea last:border-0">
                  <button
                    type="button"
                    onClick={() => pickPlace(p)}
                    className="flex w-full cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surco/[0.05]"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-tinta-2">
                      {p.kind === "department" ? t("ui.placeDepartment") : p.department}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button onClick={useMyLocation} disabled={locating}>
              {locating ? t("ui.locating") : t("ui.useMyLocation")}
            </Button>
          </div>
          {geoMsg && (
            <p role="alert" className="text-sm text-peligro">
              {geoMsg}
            </p>
          )}
        </div>
        <p className="text-sm text-tinta-2">{t("ui.drawFarm")}</p>
        <div className="flex flex-wrap gap-2">
          <Button icon={drawing ? X : PenLine} onClick={() => setDrawing(!drawing)}>
            {drawing ? t("ui.cancel") : t("ui.draw")}
          </Button>
          <label className="cursor-pointer">
            <span className="inline-flex h-9 items-center gap-2 rounded-md border border-linea bg-papel px-3.5 text-sm font-medium hover:bg-white">
              <Upload size={16} aria-hidden />
              {t("ui.importShort")}
            </span>
            <input
              type="file"
              accept=".kml,.kmz,.geojson,.json,.zip"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        </div>
        {geometry && (
          <p className="text-sm">
            {t("ui.area")}: <strong>{fmtHa(areaHa(geometry))}</strong>
          </p>
        )}
        {error ? <ErrorBox error={error} /> : null}
        <Button type="submit" disabled={!geometry || !name || busy}>
          {t("ui.save")}
        </Button>
      </form>
    </div>
  );
}
