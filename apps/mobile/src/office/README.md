# Cimientos de pantallas de oficina (ola 0)

Para dueño, administrador, agrónomo y supervisor (`!isFieldRole`). Nada del ERP se sincroniza ni se cachea en el celular.

## Agregar una pantalla en 5 pasos
1. Crear `app/office/<id>.tsx` (no se toca ningún layout: `app/office/_layout.tsx` ya da el encabezado con "volver").
2. Agregar una entrada AL FINAL de `OFFICE_MENU` en `src/office/menu.ts` (`group`, `id`, `title`/`hint` como claves i18n, `icon`, `href: "/office/<id>"`, `show?`).
3. Textos nuevos: Edit puntual en `packages/shared/src/i18n/es-PY.ts` (es-PY con voseo, nunca texto suelto).
4. Leer con `useOnline`, escribir con `useOnlineMutation`, armar con `OfficeScreen` + piezas de `ui.tsx`.
5. Verificar: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test`.

## Lectura: `useOnline.ts`
```ts
useOnline<T>(path: string | null, opts?: { ttlMs?: number; cache?: boolean }): OnlineResult<T>
// { data: T|null, loading, refreshing, error: string|null, stale, fetchedAt: number|null, offline, refresh(): Promise<void> }
```
Stale-while-revalidate: muestra lo guardado (tabla `http_cache`, clave usuario+organización+path) y refresca si hay señal y la copia pasó `ttlMs` (5 min por defecto). `path: null` = no leer. `/org/erp/*` nunca se guarda (`cache` se fuerza a false). Topes: 200 KB por entrada, 5 MB total (borra las más viejas). Se limpia en `wipeSynced` (cerrar sesión, cambiar usuario u organización). `error` solo aparece si no hay datos que mostrar; 403/404 traen el mensaje del servidor y borran la copia.

## Escritura: `useOnlineMutation.ts`
```ts
useOnlineMutation<TBody, TRes>(method: "POST"|"PUT"|"PATCH"|"DELETE", path: string | ((b: TBody) => string), opts?: { invalidate?: string[] })
// { mutate(body): Promise<{ok:true,data:TRes}|{ok:false,error:string}>, pending, error: string|null, reset() }
```
Sin señal no llama y devuelve "Esto necesita señal". Todo `body` se manda al servidor. Al terminar bien: invalida por prefijo (borra caché y relee las pantallas abiertas), háptico `success()`; el toast lo muestra quien llama (`showToast`). No usa el outbox. No lanza nunca.

## Estado: `state.tsx`
- `StaleBanner({ query })`: "Datos de hace 2 h" / "Sin señal: mostrando lo último que bajó". `OfficeScreen` lo pone solo si pasás `query`.
- `OnlineState<T>({ query, empty: {title, hint?, action?, onAction?}, isEmpty?, skeletonRows?, children: (data: T) => ReactNode })`: cargando, error/sin copia (con Reintentar), vacío, o datos.
- `Skeleton({ rows? })`.

## Marco: `OfficeScreen.tsx`
```ts
OfficeScreen({ title, subtitle?, action?: {label, onPress, icon?, disabled?, loading?}, query?, refreshing?, onRefresh?, footer?, children })
```
ScrollView con pull-to-refresh (usa `query.refresh` si no pasás `onRefresh`), acción primaria fija abajo.

## Piezas: `ui.tsx`
`StatRow({ items: {label, value, unit?, tone?: "danger"}[] })`, `KeyValue({ rows })`, `DataList<R>({ rows, keyOf, title, subtitle?, right?, icon?, onPress?, empty })` (FlatList sin scroll propio sobre 30 filas), `FilterChips<V>({ options: {value,label,count?}[], value, onChange })`, `Segmented<V>({ options, value, onChange })`, `Field({ label, hint?, error?, children })`, `TextField({ label, value, onChangeText, hint?, error?, kind?: "text"|"number"|"decimal"|"multiline", placeholder?, maxLength?, ... })`, `SelectField<V>({ label, value, options, onChange, placeholder?, hint?, error? })`, `DateField({ label, value /*ISO*/, onChange /*ISO o ""*/, hint?, error? })`, `FormSheet({ visible, title, onClose, onSubmit, submitLabel, pending?, error?, children })`, `BarList({ rows: {label, value}[], unit? })` (Views, no SVG), `LineChart({ series: {label, color, points: {x: number|string, y: number|null}[]}[], height?, yUnit? })` (SVG; colores `CHART` de `@yvy/shared`).
Helpers puros: `format.ts` (`ageText`, `fmtNumber`, `parseDecimal`, `fmtDate`, `fmtDateTime`), `date.ts` (`isoToDisplay`, `displayToIso`, `maskDate`), `chartMath.ts`.

## Ejemplo completo (`app/office/mi-pantalla.tsx`)
```tsx
export default function Productos() {
  const q = useOnline<{ id: string; name: string; stock: number }[]>("/org/products");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useOnlineMutation<{ name: string }, { id: string }>("POST", "/org/products", { invalidate: ["/org/products"] });
  const submit = async () => {
    const r = await create.mutate({ name });
    if (r.ok) { setOpen(false); showToast(t("ui.saved" as MessageKey)); }
  };
  return (
    <OfficeScreen title="Productos" query={q} action={{ label: "Nuevo", icon: Plus, onPress: () => setOpen(true) }}>
      <OnlineState query={q} empty={{ title: "Sin productos" }}>
        {(rows) => <DataList rows={rows} keyOf={(r) => r.id} title={(r) => r.name} right={(r) => String(r.stock)} empty={{ title: "Sin productos" }} />}
      </OnlineState>
      <FormSheet visible={open} title="Nuevo producto" onClose={() => setOpen(false)} onSubmit={submit} submitLabel={t("ui.save")} pending={create.pending} error={create.error}>
        <TextField label="Nombre" value={name} onChangeText={setName} />
      </FormSheet>
    </OfficeScreen>
  );
}
```
(En código real los textos van por i18n.) Plantillas reales: `app/office/review.tsx` (en línea) y `app/office/alerts.tsx` (local).
