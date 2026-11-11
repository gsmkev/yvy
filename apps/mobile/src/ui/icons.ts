import {
  ArrowRightLeft,
  Beef,
  Bug,
  HeartCrack,
  Syringe,
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
  // ganaderia
  herd_count: Beef,
  herd_move: ArrowRightLeft,
  mortality: HeartCrack,
  health: Syringe,
};

export const ALERT_ICON: Record<string, LucideIcon> = {
  water_low: Droplets,
  frost: Snowflake,
  excess_rain: CloudRainWind,
  drought: SunDim,
  fire: Flame,
};
