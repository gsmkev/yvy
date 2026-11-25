/** Un solo set de íconos (Lucide, trazo 2 px) para todo el producto. */
import {
  Anchor,
  Beef,
  CloudRain,
  Cylinder,
  DoorOpen,
  Droplet,
  Fan,
  Fence,
  Home,
  MapPin,
  School,
  Spline,
  Waves,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { PoiKind } from "@yvy/shared";

/** Un ícono por tipo de punto de interés; el mapa, las listas y la app usan el mismo. */
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
