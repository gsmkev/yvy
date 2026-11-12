// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { AuditReport } from "./auditReportPdf";
import type { AuditReportData } from "./auditReportData";
import type { Farm } from "./types";

const farm = { id: "f", name: "La Esperanza" } as unknown as Farm;
const empty: AuditReportData = { from: "2026-01-01", to: "2026-11-10", applications: [], operators: [], totalHa: 0, flagged: 0 };

describe("PDF del informe de auditoría", () => {
  it("se genera con aplicaciones y vacío", async () => {
    const full = await renderToBuffer(
      <AuditReport
        {...empty}
        farm={farm}
        generatedAt={Date.now()}
        totalHa={40}
        flagged={1}
        operators={[{ name: "Ramón", applications: 1 }]}
        applications={[
          {
            id: "a",
            at: Date.now(),
            plotName: "Lote 1",
            plotId: "p",
            operator: "Ramón",
            machine: null,
            areaHa: 40,
            windKmh: 8,
            products: [{ name: "Glifosato", activeIngredient: "glifosato", toxClass: "III", dose: 2, unit: "l_ha", withdrawalDays: 20 }],
            safeHarvestAt: Date.now() + 1e9,
            nearestM: 25,
            nearestName: "Aguada",
            flags: ["near_water_or_house"],
          },
        ]}
      />,
    );
    expect(full.subarray(0, 4).toString()).toBe("%PDF");
    const blank = await renderToBuffer(<AuditReport {...empty} farm={farm} generatedAt={Date.now()} />);
    expect(blank.subarray(0, 4).toString()).toBe("%PDF");
  });
});
