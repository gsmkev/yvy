/**
 * Administración: índice con el Resumen arriba (caja, a pagar, a cobrar, margen, faltantes, órdenes, compras) y debajo
 * los módulos de la web (Compras y ventas, Stock, Operación, Finanzas) como filas. Todo viene de /org/erp (sin caché);
 * cada persona ve solo lo que la API le devuelve: el agrónomo, solo lo de stock.
 */
import { router, type Href } from "expo-router";
import { t } from "@yvy/shared";
import { AdminGate } from "../../src/office/adminKit";
import { ADMIN_GROUP_TITLE, type ADMIN_MENU } from "../../src/office/adminMenu";
import { OverviewBody } from "../../src/office/adminOverview/OverviewSections";
import { useOverview } from "../../src/office/adminOverview/useOverview";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { Row, SectionHeader } from "../../src/ui/kit";

const go = (href: string) => router.push(href as Href);

/** Menú de administración (compras, stock, operaciones y finanzas) con el saldo de caja a la vista. */
export default function Admin() {
  const ov = useOverview(go);
  return (
    <AdminGate need="stock" title={t("ui.nav.admin")}>
      <OfficeScreen title={t("ui.nav.admin")} query={ov.manage ? ov.balances : ov.low} onRefresh={ov.refresh}>
        <SectionHeader title={t("ui.admin.group_overview")} first />
        <OverviewBody ov={ov} go={go} />
        {ov.groups.map((g) => (
          <GroupRows key={g.group} title={t(ADMIN_GROUP_TITLE[g.group])} items={g.items} />
        ))}
      </OfficeScreen>
    </AdminGate>
  );
}

function GroupRows({ title, items }: { title: string; items: typeof ADMIN_MENU }) {
  return (
    <>
      <SectionHeader title={title} />
      {items.map((m) => (
        <Row key={m.id} icon={m.icon} title={t(m.title)} subtitle={m.hint ? t(m.hint) : undefined} onPress={() => go(m.href)} />
      ))}
    </>
  );
}
