/** Un solo set de íconos (Lucide, trazo 2 px) para todo el producto. */
import {
  Bug,
  CloudRain,
  CloudRainWind,
  Droplets,
  Fence,
  Flame,
  Footprints,
  Home,
  MapPin,
  NotebookPen,
  Snowflake,
  Sprout,
  SunDim,
  Waves,
  Wheat,
  type LucideIcon,
} from "lucide-react";

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
};

export const POI_ICON: Record<string, LucideIcon> = {
  rain_gauge: CloudRain,
  water: Waves,
  house: Home,
  gate: Fence,
  corral: Fence,
  other: MapPin,
};
