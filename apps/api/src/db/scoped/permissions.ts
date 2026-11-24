/** Quién puede qué: contexto de autenticación, errores de dominio y la matriz de permisos. */
import { isFieldRole, type Role } from "@yvy/shared";

/** Quién hace el pedido: usuario, organización, rol y si la sesión es de solo lectura. */
export interface AuthCtx {
  userId: string;
  orgId: string;
  role: Role;
  /** Sesión de soporte (el equipo de Yvy viendo la organización): solo lectura. */
  readOnly?: boolean;
  supportBy?: string;
}

/** Falla por falta de permiso (403). */
export class ForbiddenError extends Error {}
/** Falla porque el recurso no existe o no es de la organización (404). */
export class NotFoundError extends Error {}
/** La acción pasa el tope del plan. Se responde 402 con el mensaje tal cual. */
export class PlanLimitError extends Error {}

/**
 * Matriz de permisos.
 * `supervisor` (capataz) = como el administrador de campo pero sin catálogo, campañas, equipo ni tablero, y solo
 * dentro de sus estancias (farm_access). `contractor` = empleado externo: mismos límites que `worker`.
 */
export const can = {
  manageOrg: (r: Role) => r === "owner",
  /** El administrador también crea empleados y contratistas. */
  manageWorkers: (r: Role) => r === "owner" || r === "admin",
  /** Solo el dueño limita a una persona a ciertas estancias. */
  manageFarmAccess: (r: Role) => r === "owner",
  editField: (r: Role) => !isFieldRole(r),
  /** Crear/editar puntos de interés (también desde el celular): todos menos los roles de campo. */
  editPoi: (r: Role) => !isFieldRole(r),
  assign: (r: Role) => !isFieldRole(r),
  viewAll: (r: Role) => !isFieldRole(r),
  reports: (r: Role) => !isFieldRole(r),
  /** Solo el dueño crea y revoca enlaces de solo lectura. */
  shareLinks: (r: Role) => r === "owner",
  /** El tablero del inicio es para dueño y administrador. */
  dashboard: (r: Role) => r === "owner" || r === "admin",
  /** Solo dueño y administrador cambian los umbrales de avisos. */
  alertSettings: (r: Role) => r === "owner" || r === "admin",
  /** Sistema productivo, carga máxima y cargas recomendadas de la estancia: dueño y administrador. */
  livestockSettings: (r: Role) => r === "owner" || r === "admin",
  /** Planificar el calendario sanitario (y crear sus tareas): todos menos los roles de campo. */
  planSanitary: (r: Role) => !isFieldRole(r),
  /** Campañas y su plan por lote; el supervisor y los roles de campo solo las ven. */
  editSeasons: (r: Role) => r === "owner" || r === "admin" || r === "agronomist",
  /** Catálogo de productos; el supervisor y los roles de campo no lo editan. */
  editProducts: (r: Role) => r === "owner" || r === "admin" || r === "agronomist",
  /** El dueño ve el registro de cambios de su organización. */
  viewAudit: (r: Role) => r === "owner",
  /** Tokens de la API pública; solo el dueño. */
  manageApiTokens: (r: Role) => r === "owner",
  /** Informes programados a terceros; dueño y administrador. */
  scheduleReports: (r: Role) => r === "owner" || r === "admin",
  /** ERP: maestros, compras, costos y montos son de dueño y administrador. */
  manageErp: (r: Role) => r === "owner" || r === "admin",
  /** El agrónomo ve las cantidades de stock (nunca montos); el supervisor y los roles de campo no entran al ERP. */
  viewStock: (r: Role) => r === "owner" || r === "admin" || r === "agronomist",
  /** Alta y edición de animales con caravana; los roles de campo los consultan (también sin señal) pero no los editan. */
  editAnimals: (r: Role) => !isFieldRole(r),
  /** Pedir la historia de vigor desde 2017 gasta minutos de cómputo: dueño y administrador. */
  requestHistory: (r: Role) => r === "owner" || r === "admin",
  /** Definir los campos propios de los formularios: dueño y administrador (todos los roles los reciben). */
  manageForms: (r: Role) => r === "owner" || r === "admin",
  /** Subir y borrar capas propias (imágenes de dron, mapas de suelos); todos las ven salvo los roles de campo. */
  manageCustomLayers: (r: Role) => r === "owner" || r === "admin" || r === "agronomist",
  /** Ver y cerrar los registros raros para revisar: todos menos los roles de campo. */
  reviewRecords: (r: Role) => !isFieldRole(r),
  /** Webhooks de la organización; dueño y administrador. */
  manageWebhooks: (r: Role) => r === "owner" || r === "admin",
  /** Pedir el cambio de cobertura entre dos fechas (mismo costo de cómputo). */
  requestAnalysis: (r: Role) => r === "owner" || r === "admin",
};
