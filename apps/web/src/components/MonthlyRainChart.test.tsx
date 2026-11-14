// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setUnits } from "../lib/units";
import { MonthlyRainChart } from "./charts";

afterEach(() => {
  cleanup();
  setUnits({ rain: "mm" });
});

const chart = () => (
  <MonthlyRainChart
    ariaLabel="Lluvia por mes"
    labels={{ gauge: "Pluviómetro", satellite: "Satélite", normal: "Normal" }}
    months={[{ label: "nov", gauge: 127, sat: null, normal: 100 }]}
  />
);
const texts = (c: HTMLElement) => [...c.querySelectorAll("svg text")].map((t) => t.textContent);

describe("MonthlyRainChart", () => {
  it("rotula el eje y las barras en mm por defecto", () => {
    const { container } = render(chart());
    expect(texts(container)).toContain("mm");
    expect(texts(container)).toContain("127");
  });

  it("con pulgadas elegidas, el eje y las barras salen en pulgadas", () => {
    setUnits({ rain: "in" });
    const { container } = render(chart());
    const t = texts(container);
    expect(t).toContain("pulg");
    expect(t).not.toContain("mm");
    expect(t).toContain("5"); // 127 mm = 5 pulgadas
  });
});
