import type { PoiKind } from "@yvy/shared";
import { POI_ICON } from "../lib/icons";

/** M-19: ícono del tipo de punto de interés, el mismo del mapa. */
export function PoiGlyph({ kind }: { kind: PoiKind }) {
  const Icon = POI_ICON[kind];
  return <Icon size={14} strokeWidth={2} aria-hidden className="mr-2 inline-block align-[-2px] text-tinta-2" />;
}
