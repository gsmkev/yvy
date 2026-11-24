import { SelectBox } from "./ui";

interface SectionGroup {
  id: string;
  /** Sin título (o con un solo ítem) el grupo no lleva encabezado. */
  label?: string;
  items: { id: string; label: string }[];
  /** Muestra el encabezado aunque tenga un solo ítem. */
  alwaysLabel?: boolean;
  /** Grupo aparte al final, en tono de peligro (baja de la cuenta). */
  danger?: boolean;
}

/**
 * Navegación secundaria de una pantalla con muchas secciones (Administración, Cuenta): columna izquierda desde lg,
 * y en el celular una fila de pills desplazable (o un selector agrupado si son más de 8). Muestra una sección por vez.
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
  const flat = groups.flatMap((g) => g.items.map((i) => ({ ...i, danger: g.danger })));
  return (
    <>
      {flat.length <= 8 ? (
        <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden print:hidden">
          {flat.map((i) => {
            const active = i.id === value;
            return (
              <button
                key={i.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(i.id)}
                className={`h-9 shrink-0 cursor-pointer rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors ${active ? "border-surco bg-surco text-lino" : `border-linea bg-papel hover:border-tinta-2/40 ${i.danger ? "text-peligro" : "text-surco"}`}`}
              >
                {i.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="lg:hidden print:hidden">
        <SelectBox className="w-full"><select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none pr-8 h-12 w-full cursor-pointer rounded-md border border-linea bg-papel px-3 text-body outline-none focus:border-accion focus:ring-2 focus:ring-accion/20"
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
        </select></SelectBox>
      </div>
      )}
      <nav
        aria-label={label}
        className="hidden max-h-[calc(100dvh-7rem)] w-52 shrink-0 flex-col gap-4 self-start overflow-y-auto lg:sticky lg:top-6 lg:flex print:hidden"
      >
        {groups.map((g) => (
          <div key={g.id} className={`flex flex-col gap-0.5 ${g.danger ? "border-t border-linea pt-3" : ""}`}>
            {g.label && (g.items.length > 1 || g.alwaysLabel) && <span className="px-3 pb-1 text-xs font-semibold text-tinta-2">{g.label}</span>}
            {g.items.map((i) => {
              const active = i.id === value;
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onChange(i.id)}
                  className={`flex h-10 cursor-pointer items-center rounded-md px-3 text-left text-sm transition-colors ${active ? "bg-surco/[0.07] font-medium text-surco" : `${g.danger ? "text-peligro" : "text-tinta-2"} hover:bg-surco/[0.04] hover:text-surco`}`}
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


