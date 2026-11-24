/** Botón que lleva a otra sección de Administración (`/administracion?s=<id>`): el requisito previo como acción. */
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "../ui";

/**
 * Botón que lleva a otra sección de Administración.
 * @param to id de la sección.
 * @param primary lo dibuja como acción principal.
 */
export function SectionButton({ to, children, primary = false }: { to: string; children: ReactNode; primary?: boolean }) {
  const navigate = useNavigate();
  return (
    <Button variant={primary ? "primary" : "secondary"} onClick={() => navigate({ to: "/administracion", search: { s: to } })}>
      {children}
    </Button>
  );
}
