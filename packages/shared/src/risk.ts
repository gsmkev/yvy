/** Informe de riesgo climático de una estancia (C-10): lo calcula workers-py y lo valida el Worker al guardarlo. */
import { z } from "zod";

const yearDays = z.object({ year: z.number().int(), days: z.number().int().min(0) });

export const farmRiskSchema = z.object({
  version: z.literal(1),
  generatedAt: z.number().int(),
  normalFrom: z.number().int(),
  normalTo: z.number().int(),
  frost: z.object({
    thresholdC: z.number(),
    perYear: z.array(yearDays).max(40),
    meanPerYear: z.number().min(0),
    worst: yearDays.nullable(),
    yearsWithFrostPct: z.number().min(0).max(100),
    typicalFirstFrost: z.string().regex(/^\d{2}-\d{2}$/).nullable(),
    typicalLastFrost: z.string().regex(/^\d{2}-\d{2}$/).nullable(),
  }),
  rain: z.object({
    annualMeanMm: z.number().min(0),
    normal: z
      .array(
        z.object({
          month: z.number().int().min(1).max(12),
          meanMm: z.number().min(0),
          p20Mm: z.number().min(0),
          p80Mm: z.number().min(0),
        }),
      )
      .max(12),
    recent: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), mm: z.number().min(0) })).max(12),
  }),
  dry: z.object({
    thresholdMm: z.number(),
    meanLongestDays: z.number().min(0),
    worst: yearDays.nullable(),
    spells15PerYear: z.number().min(0),
    summerMeanLongestDays: z.number().min(0),
  }),
  fire: z
    .object({
      radiusKm: z.number(),
      years: z.number().int(),
      total: z.number().int().min(0),
      perYear: z
        .array(z.object({ from: z.string(), to: z.string(), count: z.number().int().min(0) }))
        .max(10),
      byMonth: z.array(z.number().int().min(0)).length(12),
      nearestKm: z.number().min(0).nullable(),
      lastAt: z.number().int().nullable(),
      source: z.string().max(80),
    })
    .nullable(),
});

export type FarmRisk = z.infer<typeof farmRiskSchema>;
