import { beforeEach, describe, expect, it } from "vitest";
import { getTheme, setTheme } from "./theme";

describe("tema", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  it("fija y recuerda el tema oscuro, y vuelve a automático", () => {
    expect(getTheme()).toBe("auto");
    setTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(getTheme()).toBe("dark");
    setTheme("auto");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(getTheme()).toBe("auto");
  });
  it("ignora valores corruptos", () => {
    localStorage.setItem("yvy.theme", "violeta");
    expect(getTheme()).toBe("auto");
  });
});
