/** Datos y acciones del panel interno: métricas filtradas por búsqueda, extender prueba, crédito de referido y sesión de soporte. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../components/ui";
import { enterSupport, get, post, withQs, type Session } from "../../lib/api";
import { t } from "../../lib/i18n";
import type { OrgMetrics } from "./types";

/** Uso de un recurso de la plataforma frente a su tope. */
export interface UsageRow {
  metric: string;
  value: number;
  limit: number | null;
}

/** Métricas de las organizaciones que coinciden con `search` (se consulta al dejar de escribir) y las acciones sobre ellas. */
export function useInternal(search: string) {
  const [term, setTerm] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-metrics"] });
  const q = useQuery({
    queryKey: ["admin-metrics", term],
    placeholderData: (prev) => prev,
    queryFn: () => get<{ organizations: OrgMetrics[]; usage: UsageRow[] }>(withQs("/admin/metrics", { q: term })),
  });
  const extend = useMutation({
    mutationFn: (id: string) => post(`/admin/orgs/${id}/extend-trial`, { days: 30 }),
    onSuccess: () => {
      refresh();
      toast(t("ui.internal.trialExtended"));
    },
  });
  const credit = useMutation({
    mutationFn: (v: { id: string; credited: boolean }) => post(`/admin/orgs/${v.id}/referral-credit`, { credited: v.credited }),
    onSuccess: refresh,
  });
  const support = useMutation({ mutationFn: (id: string) => post<Session>(`/admin/orgs/${id}/support-session`), onSuccess: (s) => enterSupport(s) });
  return { q, extend, credit, support };
}
