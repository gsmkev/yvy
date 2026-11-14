export interface SectionGroup {
  id: string;
  /** Sin título (o con un solo ítem) el grupo no lleva encabezado. */
  label?: string;
  items: { id: string; label: string }[];
}

/**
 * Navegación secundaria de una pantalla con muchas secciones (Administración, Cuenta): columna izquierda desde lg,
 * y un selector agrupado en el celular. Muestra una sección por vez.
 */
export function SectionNav({
  groups,
  value,
  onChange,
  label,
}: {
  groups: SectionGroup[];
  value: string;
  onChange: (id: string) => void;
  /** Nombre accesible de la navegación y del selector. */
  label: string;
}) {
  return (
    <>
      <div className="lg:hidden print:hidden">
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-full cursor-pointer rounded-md border border-linea bg-papel px-3 text-[15px] outline-none focus:border-accion focus:ring-2 focus:ring-accion/20"
        >
          {groups.map((g) => (
            <optgroup key={g.id} label={g.label ?? ""}>
              {g.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <nav
        aria-label={label}
        className="hidden max-h-[calc(100dvh-7rem)] w-52 shrink-0 flex-col gap-4 self-start overflow-y-auto lg:sticky lg:top-6 lg:flex print:hidden"
      >
        {groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-0.5">
            {g.label && g.items.length > 1 && <span className="px-3 pb-1 text-xs font-semibold text-tinta-2">{g.label}</span>}
            {g.items.map((i) => {
              const active = i.id === value;
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onChange(i.id)}
                  className={`flex h-10 cursor-pointer items-center rounded-md px-3 text-left text-sm transition-colors ${active ? "bg-surco/[0.07] font-medium text-surco" : "text-tinta-2 hover:bg-surco/[0.04] hover:text-surco"}`}
                >
                  {i.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}

export const sectionLayoutCls = "mx-auto flex w-full flex-col gap-4 p-4 lg:flex-row lg:gap-10 lg:p-6";
