/** Quién puede qué: contexto de autenticación, errores de dominio y la matriz de permisos (PRD §9). */
import { isFieldRole, type Role } from "@yvy/shared";

export interface AuthCtx {
  userId: string;
  orgId: string;
  role: Role;
  /** P-12: sesión de soporte (el equipo de Yvy viendo la organización): solo lectura. */
  readOnly?: boolean;
  supportBy?: string;
}

export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}
/** P-10: la acción pasa el tope del plan. Se responde 402 con el mensaje tal cual. */
export class PlanLimitError extends Error {}

/**
 * Matriz de permisos (PRD §9, ampliada en docs/PRD-roles.md).
 * `supervisor` (capataz, T-09) = como el administrador de campo pero sin catálogo, campañas, equipo ni tablero, y solo
 * dentro de sus estancias (farm_access). `contractor` (K-03) = empleado externo: mismos límites que `worker`.
 */
export const can = {
  manageOrg: (r: Role) => r === "owner",
  /** RF-04: el administrador también crea empleados y contratistas. */
  manageWorkers: (r: Role) => r === "owner" || r === "admin",
  /** T-09 / K-05: solo el dueño limita a una persona a ciertas estancias. */
  manageFarmAccess: (r: Role) => r === "owner",
  editField: (r: Role) => !isFieldRole(r),
  /** PRD §9: crear/editar puntos de interés (también desde el celular, PRD §11): todos menos los roles de campo. */
  editPoi: (r: Role) => !isFieldRole(r),
  assign: (r: Role) => !isFieldRole(r),
  viewAll: (r: Role) => !isFieldRole(r),
  reports: (r: Role) => !isFieldRole(r),
  /** K-04: solo el dueño crea y revoca enlaces de solo lectura. */
  shareLinks: (r: Role) => r === "owner",
  /** R-06: el tablero del inicio es para dueño y administrador. */
  dashboard: (r: Role) => r === "owner" || r === "admin",
  /** C-04: solo dueño y administrador cambian los umbrales de avisos. */
  alertSettings: (r: Role) => r === "owner" || r === "admin",
  /** ADR 0005: sistema productivo, carga máxima y cargas recomendadas de la estancia: dueño y administrador. */
  livestockSettings: (r: Role) => r === "owner" || r === "admin",
  /** G-10: planificar el calendario sanitario (y crear sus tareas): todos menos los roles de campo. */
  planSanitary: (r: Role) => !isFieldRole(r),
  /** ADR 0004: campañas y su plan por lote; el supervisor y los roles de campo solo las ven. */
  editSeasons: (r: Role) => r === "owner" || r === "admin" || r === "agronomist",
  /** ADR 0004: catálogo de productos; el supervisor y los roles de campo no lo editan. */
  editProducts: (r: Role) => r === "owner" || r === "admin" || r === "agronomist",
  /** K-06: el dueño ve el registro de cambios de su organización. */
  viewAudit: (r: Role) => r === "owner",
  /** I-01: tokens de la API pública; solo el dueño. */
  manageApiTokens: (r: Role) => r === "owner",
  /** R-10: informes programados a terceros; dueño y administrador. */
  scheduleReports: (r: Role) => r === "owner" || r === "admin",
  /** ADR 0004 (ERP): maestros, compras, costos y montos son de dueño y administrador. */
  manageErp: (r: Role) => r === "owner" || r === "admin",
  /** El agrónomo ve las cantidades de stock (nunca montos); el supervisor y los roles de campo no entran al ERP. */
  viewStock: (r: Role) => r === "owner" || r === "admin" || r === "agronomist",
  /** G-21: alta y edición de animales con caravana; los roles de campo los consultan (también sin señal) pero no los editan. */
  editAnimals: (r: Role) => !isFieldRole(r),
  /** S-03: pedir la historia de vigor desde 2017 gasta minutos de cómputo: dueño y administrador. */
  requestHistory: (r: Role) => r === "owner" || r === "admin",
  /** F-14: definir los campos propios de los formularios: dueño y administrador (todos los roles los reciben). */
  manageForms: (r: Role) => r === "owner" || r === "admin",
  /** M-17: subir y borrar capas propias (imágenes de dron, mapas de suelos); todos las ven salvo los roles de campo. */
  manageCustomLayers: (r: Role) => r === "owner" || r === "admin" || r === "agronomist",
  /** X-26: ver y cerrar los registros raros para revisar: todos menos los roles de campo. */
  reviewRecords: (r: Role) => !isFieldRole(r),
  /** I-02: webhooks de la organización; dueño y administrador. */
  manageWebhooks: (r: Role) => r === "owner" || r === "admin",
  /** S-31: pedir el cambio de cobertura entre dos fechas (mismo costo de cómputo). */
  requestAnalysis: (r: Role) => r === "owner" || r === "admin",
};
