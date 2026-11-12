import { describe, expect, it } from "vitest";
import { tk } from "../../lib/i18n";

describe("textos legales", () => {
  it("tienen las 9 secciones de términos y de privacidad", () => {
    for (const prefix of ["terms", "privacy"]) {
      for (let n = 1; n <= 9; n++) {
        for (const part of ["Title", "Text"]) {
          const key = `ui.${prefix}S${n}${part}`;
          expect(tk(key), key).not.toBe(key);
        }
      }
    }
  });
});
