/**
 * Selector de organización (agrónomo con varios clientes). Las tablas locales son de una sola organización, así que
 * cambiar de organización es como cambiar de usuario (switchUser.ts): se bloquea si queda algo sin mandar, se pide la
 * sesión nueva a POST /auth/switch, se borra lo bajado de la organización anterior y se empieza de cero.
 */
import type { LocalDb } from "../db/store";
import { canSwitchUser, unsentSummary } from "./switchUser";
import type { Session } from "./session";

/** Lo que es de la organización anterior y no debe verse en la nueva. */
const ORG_KV = ["selected_farm_id", "member_names", "member_names_at", "form_config", "last_sync_at"];

export type OrgSwitchResult =
  | { ok: true; session: Session }
  | { ok: false; reason: "pending" | "rejected"; n: number }
  | { ok: false; reason: "same" };

export interface OrgSwitchDeps {
  db: LocalDb;
  current: Session;
  /** POST /auth/switch. */
  requestSession: (organizationId: string) => Promise<Session>;
  setSession: (s: Session) => Promise<void>;
}

export async function switchOrganization(d: OrgSwitchDeps, organizationId: string): Promise<OrgSwitchResult> {
  if (organizationId === d.current.organization.id) return { ok: false, reason: "same" };
  const block = canSwitchUser(unsentSummary(d.db));
  if (block.blocked) return { ok: false, reason: block.reason, n: block.n };
  // Primero la sesión nueva: si el servidor la niega (403) o no hay señal, no se borra nada.
  const next = await d.requestSession(organizationId);
  d.db.wipeSynced(); // tablas sincronizadas, cursores y copia de lectura
  for (const k of ORG_KV) d.db.setKv(k, null);
  d.db.deleteKvPrefix("forecast:");
  await d.setSession(next);
  return { ok: true, session: next };
}

/** Organizaciones entre las que se puede elegir (más de una). */
export const orgOptions = (s: Session | null): { id: string; name: string; role: string }[] =>
  s?.organizations && s.organizations.length > 1 ? s.organizations : [];
