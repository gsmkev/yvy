import { describe, expect, it } from "vitest";
import { addMemberAndLogin, call, createOrgWithOwner } from "./helpers";

describe("recorrido de primera vez (U-24)", () => {
  it("el estado de la guía es de cada persona: se oculta, se vuelve a mostrar y no pasa a otros", async () => {
    const owner = await createOrgWithOwner();
    const admin = await addMemberAndLogin(owner.token, "admin");
    const get = (token: string) => call<{ dismissedAt: number | null }>("GET", "/me/onboarding", { token });
    expect((await get(owner.token)).body.dismissedAt).toBeNull();
    const hid = await call<{ dismissedAt: number }>("PUT", "/me/onboarding", { token: owner.token, body: { dismissed: true } });
    expect(hid.status).toBe(200);
    expect(hid.body.dismissedAt).toBeGreaterThan(0);
    expect((await get(owner.token)).body.dismissedAt).toBe(hid.body.dismissedAt);
    expect((await get(admin.token)).body.dismissedAt).toBeNull();
    await call("PUT", "/me/onboarding", { token: owner.token, body: { dismissed: false } });
    expect((await get(owner.token)).body.dismissedAt).toBeNull();
    expect((await call("PUT", "/me/onboarding", { token: owner.token, body: { dismissed: "si" } })).status).toBe(400);
  });
});
