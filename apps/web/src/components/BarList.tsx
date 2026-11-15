/** Barras horizontales con etiqueta y cifra: reparto de registros por tipo o por persona. */
export function BarList({ items, ariaLabel }: { items: { label: string; value: number }[]; ariaLabel: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="truncate" title={i.label}>
            {i.label}
          </span>
          <span className="h-2 rounded-full bg-linea/60" aria-hidden>
            <span className="block h-full rounded-full bg-soja" style={{ width: `${Math.max(3, (i.value / max) * 100)}%` }} />
          </span>
          <span className="num text-right tabular-nums">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}
