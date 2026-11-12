/** Un solo set de íconos (Lucide, trazo 2 px) para todo el producto. */
import {
  Anchor,
  Beef,
  Bug,
  CloudRain,
  CloudRainWind,
  Cylinder,
  DoorOpen,
  Droplet,
  Droplets,
  Fan,
  Fence,
  Flame,
  Footprints,
  Home,
  MapPin,
  NotebookPen,
  School,
  Spline,
  Snowflake,
  Sprout,
  SunDim,
  Thermometer,
  Waves,
  Warehouse,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import type { PoiKind } from "@yvy/shared";

export const RECORD_ICON: Record<string, LucideIcon> = {
  scouting: Footprints,
  pest: Bug,
  crop_status: Sprout,
  pasture_status: Wheat,
  rain: CloudRain,
  water: Droplets,
  note: NotebookPen,
};

export const ALERT_ICON: Record<string, LucideIcon> = {
  frost: Snowflake,
  excess_rain: CloudRainWind,
  drought: SunDim,
  fire: Flame,
  pest_threshold: Bug,
  water_low: Waves,
  heat_stress: Thermometer,
  rust_risk: Bug,
};

/** M-19: un ícono por tipo de punto de interés; el mapa, las listas y la app usan el mismo. */
export const POI_ICON: Record<PoiKind, LucideIcon> = {
  rain_gauge: CloudRain,
  water: Waves,
  house: Home,
  school: School,
  gate: DoorOpen,
  corral: Fence,
  silo: Cylinder,
  shed: Warehouse,
  bridge: Spline,
  mill: Fan,
  trough: Droplet,
  chute: Beef,
  dock: Anchor,
  other: MapPin,
};
