/**
 * Índice de precipitación estandarizado, SPI a 1, 3 y 6 meses (C-07). Lo calcula workers-py: la lluvia reciente de
 * CHIRPS contra una distribución gamma ajustada a 1991-2020 (normal climatológica de NASA POWER, la misma que usa la
 * climatología de la estancia). El Worker solo valida la forma del resultado y lo guarda.
 */
import { z } from "zod";

export const SPI_SCALES = [1, 3, 6] as const;

export const SPI_CATEGORIES = [
  "extreme_drought",
  "severe_drought",
  "moderate_drought",
  "normal",
  "moderate_wet",
  "very_wet",
  "extreme_wet",
] as const;
export type SpiCategory = (typeof SPI_CATEGORIES)[number];

/** Categorías de McKee et al. (1993). */
export const spiCategory = (v: number): SpiCategory =>
  v <= -2
    ? "extreme_drought"
    : v <= -1.5
      ? "severe_drought"
      : v <= -1
        ? "moderate_drought"
        : v < 1
          ? "normal"
          : v < 1.5
            ? "moderate_wet"
            : v < 2
              ? "very_wet"
              : "extreme_wet";

export const farmSpiSchema = z.object({
  version: z.literal(1),
  generatedAt: z.number().int(),
  /** Último mes completo que entra al cálculo ("YYYY-MM"). */
  throughMonth: z.string().regex(/^\d{4}-\d{2}$/),
  referenceFrom: z.number().int(),
  referenceTo: z.number().int(),
  scales: z
    .array(
      z.object({
        scale: z.union([z.literal(1), z.literal(3), z.literal(6)]),
        /** null si falta lluvia de CHIRPS en la ventana o la climatología no alcanza. */
        spi: z.number().min(-4).max(4).nullable(),
        mm: z.number().min(0).nullable(),
        normalMm: z.number().min(0).nullable(),
        reason: z.enum(["chirps_incomplete", "no_reference"]).nullable(),
      }),
    )
    .max(3),
});
export type FarmSpi = z.infer<typeof farmSpiSchema>;
