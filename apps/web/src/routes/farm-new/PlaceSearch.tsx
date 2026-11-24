/** Buscador de lugares y coordenadas, y "usar mi ubicación"; el mapa se mueve con `onGoTo`. */
import { useState } from "react";
import { Button, Field, Input } from "../../components/ui";
import { parseLocation } from "../../lib/coords";
import { t } from "../../lib/i18n";
import { searchPlaces, type Place } from "../../lib/places-py";

/** Buscador de lugares y coordenadas, y "usar mi ubicación"; el mapa se mueve con `onGoTo`. */
export function PlaceSearch({
  onGoTo,
  onPlace,
}: {
  onGoTo: (lon: number, lat: number, zoom?: number) => void;
  /** Se eligió un lugar de la lista: sirve para completar departamento y distrito. */
  onPlace: (p: Place) => void;
}) {
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [place, setPlace] = useState("");
  const found = searchPlaces(place);
  const coords = parseLocation(place);
  const goCoords = () => {
    if (!coords) return;
    onGoTo(coords.lon, coords.lat, 16);
    setPlace("");
  };
  const pickPlace = (p: Place) => {
    onGoTo(p.lon, p.lat, p.zoom);
    setPlace("");
    onPlace(p);
  };
  const useMyLocation = () => {
    setGeoMsg(null);
    if (!("geolocation" in navigator)) return setGeoMsg(t("ui.geo.unsupported"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        onGoTo(p.coords.longitude, p.coords.latitude, 15);
      },
      (e) => {
        setLocating(false);
        setGeoMsg(e.code === e.PERMISSION_DENIED ? t("ui.geo.denied") : t("ui.geo.failed"));
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  return (
  <div className="flex flex-col gap-1.5">
    <Field label={t("ui.place.search")}>
      <Input
        value={place}
        placeholder={t("ui.place.searchPlaceholder")}
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
              <span className="font-medium">{t("ui.place.goCoords")}</span>
              <span className="num text-xs text-tinta-2">
                {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
              </span>
            </button>
          </li>
        )}
        {!coords && found.length === 0 && <li className="px-3 py-2 text-sm text-tinta-2">{t("ui.place.none")}</li>}
        {found.map((p) => (
          <li key={`${p.kind}${p.name}`} className="border-b border-linea last:border-0">
            <button
              type="button"
              onClick={() => pickPlace(p)}
              className="flex w-full cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surco/[0.05]"
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-tinta-2">
                {p.kind === "department" ? t("ui.place.department") : p.department}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
    <div>
      <Button onClick={useMyLocation} disabled={locating}>
        {locating ? t("ui.common.locating") : t("ui.use.myLocation")}
      </Button>
    </div>
    {geoMsg && (
      <p role="alert" className="text-sm text-peligro">
        {geoMsg}
      </p>
    )}
  </div>
  );
}
