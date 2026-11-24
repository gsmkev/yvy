/**
 * ERP sencillo (ADR 0004): constantes, esquemas de entrada y cálculos puros (dinero, stock, costos).
 * Sin dependencias de la base: corre en el Worker, la web y las pruebas.
 *
 * Dinero: siempre enteros en la unidad menor de la moneda. PYG no tiene decimales (1 = un guaraní);
 * USD va en centavos. Todo costo guarda además su valor en guaraníes (`amountPyg`) con el tipo de cambio
 * del día, así los informes suman con una sola consulta.
 */
export * from "./core";
export * from "./fleet";
export * from "./costs";
export * from "./stock";
export * from "./people";
export * from "./trade";
export * from "./finance";
