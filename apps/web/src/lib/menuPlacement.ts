/** Posición de un menú desplegable para que quede siempre dentro de la pantalla. */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Placement {
  /** "right": el borde derecho del menú con el del botón (se abre hacia la izquierda); "left": borde izquierdo con borde izquierdo. */
  align: "left" | "right";
  /** Abre hacia arriba del botón. */
  up: boolean;
}

/**
 * Prefiere `align` y abajo (o arriba con `preferUp`). Si no entra de ese lado prueba el otro; si no entra en ninguno, elige el que tenga más lugar.
 * `menu` es el tamaño del menú, `view` el área visible donde puede abrirse (la ventana recortada por los contenedores con desplazamiento) y `gap` la separación con el botón.
 */
export function placeMenu(
  trigger: Box,
  menu: { w: number; h: number },
  view: Box,
  align: "left" | "right" = "right",
  margin = 8,
  gap = 4,
  preferUp = false,
): Placement {
  const roomRight = trigger.right - margin - view.left; // espacio hacia la izquierda si se alinea al borde derecho
  const roomLeft = view.right - margin - trigger.left; // espacio hacia la derecha si se alinea al borde izquierdo
  const fitsRight = roomRight >= menu.w;
  const fitsLeft = roomLeft >= menu.w;
  let side: "left" | "right" = align;
  if (align === "right" && !fitsRight) side = fitsLeft || roomLeft > roomRight ? "left" : "right";
  else if (align === "left" && !fitsLeft) side = fitsRight || roomRight > roomLeft ? "right" : "left";

  const below = view.bottom - margin - trigger.bottom - gap;
  const above = trigger.top - margin - gap - view.top;
  const up = preferUp ? above >= menu.h || above > below : below < menu.h && above > below;
  return { align: side, up };
}

/** Área visible para un menú que nace en `el`: la ventana, recortada por cada ancestro que oculta o desplaza lo que sobra. */
export function visibleArea(el: HTMLElement): Box {
  const area: Box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const st = getComputedStyle(p);
    if (/(auto|scroll|hidden|clip)/.test(`${st.overflowX} ${st.overflowY}`)) {
      const r = p.getBoundingClientRect();
      area.left = Math.max(area.left, r.left);
      area.top = Math.max(area.top, r.top);
      area.right = Math.min(area.right, r.right);
      area.bottom = Math.min(area.bottom, r.bottom);
    }
  }
  return area;
}
