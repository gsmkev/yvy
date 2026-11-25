/** Datos y acciones de la pantalla del equipo: estancias de cada persona, vincular dispositivo y baja. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FarmAccessLevel } from "@yvy/shared";
import { toast } from "../../components/ui";
import { del, get, post } from "../../lib/api";
import { t } from "../../lib/i18n";
import { useFarms, useMe, useMembers } from "../../lib/queries";
import type { Member } from "../../lib/types";
import { isScoped } from "./teamColumns";

/** Código QR para vincular el dispositivo de un miembro. */
export interface LinkQr {
  member: Member;
  qr: string;
  expiresAt: number;
}

/** Miembros, estancias de cada uno y las mutaciones de vincular y dar de baja; `onRemoved` cierra la confirmación. */
export function useTeam(onLinked: (q: LinkQr) => void, onRemoved: () => void) {
  const me = useMe();
  const members = useMembers();
  const farms = useFarms();
  const qc = useQueryClient();
  const access = useQuery({
    enabled: me.data?.role === "owner",
    queryKey: ["farm-access"],
    queryFn: () => get<{ userId: string; farmId: string; level: FarmAccessLevel }[]>("/org/farm-access"),
  });
  const link = useMutation({
    mutationFn: (m: Member) => post<{ qr: string; expiresAt: number }>("/auth/link", { userId: m.userId }).then((r) => ({ member: m, ...r })),
    onSuccess: onLinked,
  });
  const remove = useMutation({
    mutationFn: (m: Member) => del(`/org/members/${m.userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      toast(t("ui.toast.memberRemoved"));
      onRemoved();
    },
  });
  // Solo el dueño administra las estancias que ve cada persona con acceso por estancia
  const farmsOf = (m: Member) => {
    if (!isScoped(m)) return "";
    const mine = (access.data ?? []).filter((a) => a.userId === m.userId).map((a) => farms.data?.find((f) => f.id === a.farmId)?.name);
    if (mine.length === 0) return t(m.role === "supervisor" ? "ui.team.farmsNone" : "ui.team.farmsAll");
    return mine.filter(Boolean).join(", ");
  };
  return { me, members, link, remove, farmsOf };
}
