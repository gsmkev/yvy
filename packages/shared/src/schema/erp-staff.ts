/** Tablas del ERP sobre personal, mantenimiento y pagos; son de oficina y no se sincronizan. */

import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { CONTRACTOR_SERVICES, CURRENCIES, EMPLOYEE_PAYMENT_KINDS, MAINTENANCE_KINDS } from "../erp";
import { timestamps } from "./columns";

// ---------- ERP, segunda tanda: tablas de oficina, no se sincronizan ----------

/** Plan de mantenimiento preventivo de una máquina: cada tantas horas o kilómetros. */
export const maintenancePlans = sqliteTable(
  "maintenance_plans",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    machineId: text("machine_id").notNull(),
    name: text("name").notNull(),
    /** Cada cuántas horas o kilómetros (según el medidor de la máquina). */
    everyUnits: real("every_units").notNull(),
    /** Lectura del medidor en el último servicio. */
    lastDoneMeter: real("last_done_meter").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("maintenance_plans_machine_idx").on(t.organizationId, t.machineId)],
);

/** Historial de servicios y reparaciones de una máquina, con su costo. */
export const maintenanceLogs = sqliteTable(
  "maintenance_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    machineId: text("machine_id").notNull(),
    planId: text("plan_id"),
    kind: text("kind", { enum: MAINTENANCE_KINDS }).notNull(),
    occurredAt: integer("occurred_at").notNull(),
    meterValue: real("meter_value"),
    description: text("description"),
    partyId: text("party_id"),
    amount: integer("amount"),
    currency: text("currency", { enum: CURRENCIES }),
    amountPyg: integer("amount_pyg"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("maintenance_logs_machine_idx").on(t.organizationId, t.machineId, t.occurredAt)],
);

/** Datos para costear el trabajo propio de una máquina: amortización, operario, rendimiento y combustible. */
export const machineCosts = sqliteTable(
  "machine_costs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    machineId: text("machine_id").notNull(),
    /** Labor que hace la máquina: se compara con los contratistas de ese servicio. */
    service: text("service", { enum: CONTRACTOR_SERVICES }).notNull(),
    /** Valor de compra y de reventa estimado, en guaraníes. */
    purchasePricePyg: integer("purchase_price_pyg").notNull().default(0),
    residualPyg: integer("residual_pyg").notNull().default(0),
    /** Vida útil en horas de motor. */
    lifeHours: real("life_hours").notNull().default(0),
    /** Costo del operario por hora, en guaraníes. */
    operatorPerHourPyg: integer("operator_per_hour_pyg").notNull().default(0),
    /** Hectáreas por hora de trabajo. */
    haPerHour: real("ha_per_hour"),
    /** Litros por hora (si no se carga, sale de las cargas de combustible) y precio del litro (si no, el costo del stock). */
    fuelLitersPerHour: real("fuel_liters_per_hour"),
    fuelPricePyg: integer("fuel_price_pyg"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("machine_costs_machine_uq").on(t.organizationId, t.machineId)],
);

/** Personal (peones, capataz, administrativos) con su jornal. Puede o no tener usuario en la app. */
export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    /** Cédula de identidad. */
    ci: text("ci"),
    phone: text("phone"),
    /** Jornal por día completo, en guaraníes. */
    dailyWagePyg: integer("daily_wage_pyg").notNull().default(0),
    /** Si trabaja con la app, su usuario (sin cargarlo dos veces). */
    userId: text("user_id"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("employees_org_idx").on(t.organizationId, t.name)],
);

/** Asistencia y jornal de un día, con el lote y la labor. Genera un costo de mano de obra. */
export const attendance = sqliteTable(
  "attendance",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    employeeId: text("employee_id").notNull(),
    /** "YYYY-MM-DD". */
    date: text("date").notNull(),
    /** 1 = día completo, 0.5 = medio día. */
    days: real("days").notNull(),
    farmId: text("farm_id"),
    plotId: text("plot_id"),
    seasonId: text("season_id"),
    labor: text("labor"),
    /** Jornal del día en guaraníes (el jornal vigente por los días, o el que se cargó a mano). */
    wagePyg: integer("wage_pyg").notNull(),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [
    index("attendance_date_idx").on(t.organizationId, t.date),
    index("attendance_employee_idx").on(t.organizationId, t.employeeId, t.date),
  ],
);

/** Adelantos y pagos a un empleado, en guaraníes. El saldo es lo devengado (asistencia) menos esto. */
export const employeePayments = sqliteTable(
  "employee_payments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    employeeId: text("employee_id").notNull(),
    /** "YYYY-MM-DD". */
    date: text("date").notNull(),
    kind: text("kind", { enum: EMPLOYEE_PAYMENT_KINDS }).notNull(),
    amountPyg: integer("amount_pyg").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("employee_payments_idx").on(t.organizationId, t.employeeId, t.date)],
);

/** Ración de feedlot: ingredientes del catálogo con su % de materia seca, en JSON [{productId, pctDm, dmPct}]. Solo oficina. */
