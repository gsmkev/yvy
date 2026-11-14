import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { t } from "../lib/i18n";
import { PageHeader } from "./ui";

/** Encabezado de las subpáginas de una estancia: volver a la estancia (por su nombre) y el título de la página. */
export function FarmPageHeader({
  farmId,
  farmName,
  title,
  primary,
  menu,
}: {
  farmId: string;
  farmName: string;
  title: string;
  primary?: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <Link
        to="/estancias/$farmId"
        params={{ farmId }}
        className="inline-flex h-10 w-fit items-center rounded-md text-sm text-tinta-2 hover:text-surco hover:underline"
      >
        {t("ui.farmBack", { name: farmName })}
      </Link>
      <PageHeader title={title} primary={primary} menu={menu} />
    </div>
  );
}
