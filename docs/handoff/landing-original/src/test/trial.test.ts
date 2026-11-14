import { describe, expect, it } from "vitest";
import { site } from "@/content/site";

describe("Free trial", () => {
  it("lasts exactly 30 days", () => {
    expect(site.trialDays).toBe(30);
  });
});