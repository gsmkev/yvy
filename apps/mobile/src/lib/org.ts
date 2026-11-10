import { getDb } from "./db";
import type { Session } from "./session";

/** Después de ingresar: si la organización es otra que la de la vez anterior, Hoy avisa a cuál entró. */
export function noteOrganizationEntry(session: Session): void {
  const db = getDb();
  const prev = db.getKv("last_org_name");
  db.setKv("last_org_name", session.organization.name);
  db.setKv("org_entered_notice", prev && prev !== session.organization.name ? session.organization.name : null);
}
