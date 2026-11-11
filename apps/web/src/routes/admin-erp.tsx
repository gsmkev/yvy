/** Administración (ADR 0004): maestros, stock, costos y márgenes. Solo dueño y administradores. */
import type { ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ProductsPanel } from "../components/ProductsPanel";
import { Tabs } from "../components/ui";
import { t, type MessageKey } from "../lib/i18n";
import { useMe } from "../lib/queries";

interface Section {
  id: string;
  label: MessageKey;
  render: () => ReactNode;
}

/** Cada ítem del ERP suma su sección acá. */
const SECTIONS: Section[] = [
  { id: "products", label: "ui.adminSection_products", render: () => <ProductsPanel canEdit /> },
];

export function AdminPage() {
  const me = useMe();
  const navigate = useNavigate();
  const { s } = useSearch({ strict: false }) as { s?: string };
  const current = SECTIONS.find((x) => x.id === s) ?? SECTIONS[0]!;
  const allowed = me.data?.role === "owner" || me.data?.role === "admin";
  if (me.data && !allowed) return <div className="mx-auto max-w-3xl p-4 text-sm text-tinta-2">{t("ui.adminNoAccess")}</div>;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold">{t("ui.adminTitle")}</h1>
        <p className="text-sm text-tinta-2">{t("ui.adminIntro")}</p>
      </div>
      <Tabs
        tabs={SECTIONS.map((x) => ({ id: x.id, label: t(x.label) }))}
        value={current.id}
        onChange={(id) => navigate({ to: "/administracion", search: { s: id } })}
      />
      {allowed && <div key={current.id}>{current.render()}</div>}
    </div>
  );
}
