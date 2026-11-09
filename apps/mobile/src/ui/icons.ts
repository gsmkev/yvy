import {
  Bug,
  CloudRain,
  Droplets,
  Footprints,
  NotebookPen,
  Sprout,
  Wheat,
  Flame,
  Snowflake,
  CloudRainWind,
  SunDim,
  type LucideIcon,
} from "lucide-react-native";
import type { RecordKind } from "@yvy/shared";

export const RECORD_ICON: Record<RecordKind, LucideIcon> = {
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
};
