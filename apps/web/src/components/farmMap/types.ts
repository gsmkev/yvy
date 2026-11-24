import type { FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import type { Camera } from "../../lib/scenes";
import type { Layer, Plot, Poi } from "../../lib/types";

export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  label?: string;
  color?: string;
  /** Radio del punto en píxeles (6 si falta). */
  radius?: number;
}

export interface FarmMapProps {
  outline?: string | null; // GeoJSON de la estancia
  plots?: Plot[];
  pois?: Poi[];
  /** Áreas problema del lote (S-08): borde punteado de alerta. */
  problemAreas?: { id: string; geometry: string }[];
  points?: MapPoint[];
  /** Agrupa los puntos que se superponen (con el número de puntos); al tocar un grupo, el mapa se acerca. */
  clusterPoints?: boolean;
  /** Mapa de calor de recorridas (F-06): puntos a lo largo de las recorridas grabadas. */
  heat?: [number, number][];
  /** Varias estancias a la vez (inicio): perímetro, nombre y fondo satelital propio. */
  farms?: { id: string; name: string; geometry: string; basemapPath?: string | null; alert?: boolean }[];
  layers?: Layer[];
  /** M-16: límites administrativos (geoBoundaries); sin datos, la capa no existe. */
  boundaries?: FeatureCollection | null;
  /** M-17: imágenes propias georreferenciadas (url local), de abajo hacia arriba. */
  customImages?: { id: string; url: string; corners: [number, number][]; opacity: number }[];
  tilesBaseUrl?: string;
  showNdvi?: boolean;
  /** S-07: índice que muestra la capa de vigor (NDVI por defecto). */
  indexKind?: Layer["layer"];
  /** Capa elegida por tipo (S-04); si falta, la más nueva. */
  layerIds?: Partial<Record<Layer["layer"], string>>;
  /** Cámara compartida entre dos mapas (comparar con cortina): se aplica al cambiar y se avisa al mover con el mouse. */
  camera?: Camera | null;
  onCamera?: (c: Camera) => void;
  selectedPlotId?: string | null;
  /** Lotes marcados para una tarea (selección múltiple): se dibujan como el lote elegido. */
  pickedPlotIds?: string[];
  /** T-07: lotes sin visitar (borde trigo cuando se filtra por ellos). */
  stalePlotIds?: string[];
  bounds?: [number, number, number, number] | null;
  /** Vuela a un punto (cambiar `n` para repetir el mismo destino). */
  flyTo?: { lon: number; lat: number; zoom?: number; n: number } | null;
  drawing?: boolean;
  /** Dibujo de una línea (cortar un lote, trazar un alambrado). Termina con doble toque o Enter. */
  /** M-20: alambrados, caminos y cañerías de la estancia. */
  lines?: { id: string; kind: string; geometry: string }[];
  drawingLine?: boolean;
  onLineDrawn?: (g: LineString) => void;
  /** M-02: lote cuya forma se edita (vértices arrastrables). Se oculta de la capa de lotes mientras tanto. */
  editPlot?: { id: string; geometry: string } | null;
  onEditChange?: (g: Polygon | MultiPolygon) => void;
  onDrawn?: (g: Polygon) => void;
  onPlotClick?: (id: string) => void;
  onPointClick?: (id: string) => void;
  onMapClick?: (lon: number, lat: number) => void;
  /** Herramienta de medir: puntos marcados, forma cerrada y avisos de clic. */
  measuring?: boolean;
  measurePoints?: [number, number][];
  measureClosed?: boolean;
  onMeasureClick?: (lon: number, lat: number) => void;
  /** El clic cayó sobre el primer punto: cierra la forma. */
  onMeasureClose?: () => void;
  className?: string;
  /** U-27: se llena con una función que devuelve la captura del mapa (PNG en data URL) o null si no se puede. */
  snapshotRef?: { current: (() => Promise<string | null>) | null };
  /** Botones + y − de MapLibre arriba a la derecha (por defecto sí). Sin ellos, el mapa se acerca con `apiRef`. */
  navControl?: boolean;
  /** Se llena con funciones para manejar el mapa desde afuera (zoom de la barra de herramientas). */
  apiRef?: { current: { zoom: (dir: 1 | -1) => void } | null };
}
