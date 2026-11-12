/** T-08: comentarios y menciones en registros. */
import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { newId } from "@yvy/shared";
import { sendMentions } from "../src/jobs/notify";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db, pullAll } from "./helpers";
import { push, rec } from "./records-helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
  const agro = await addMemberAndLogin(owner.token, "agronomist", "Agro Ana");
  const worker = await addMemberAndLogin(owner.token, "worker", "Ramón");
  await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
  const r = rec(farmId, plotIds[0]!, "rain", { mm: 5, readAt: Date.now() });
  await push(owner.token, [r]);
  return { owner, agro, worker, farmId, plotIds, recordId: r.row.id };
}

describe("T-08 · comentarios", () => {
  it("se comenta desde la web, con menciones válidas, y baja por sync", async () => {
    const { owner, worker, recordId } = await setup();
    const res = await call<{ id: string; mentions: string[] }>("POST", `/org/records/${recordId}/comments`, {
      token: owner.token,
      body: { body: "@Ramón mirá esto", mentions: [worker.userId, newId(), owner.userId] },
    });
    expect(res.status).toBe(201);
    // solo el miembro real y que no es el autor
    expect(res.body.mentions).toEqual([worker.userId]);
    const list = await call<{ body: string; authorName: string }[]>("GET", `/org/records/${recordId}/comments`, { token: worker.token });
    expect(list.body.map((c) => c.body)).toEqual(["@Ramón mirá esto"]);
    expect((await pullAll(worker.token, "comments")).length).toBe(1);
  });

  it("el empleado solo ve comentarios de registros que ve", async () => {
    const { owner, worker, farmId, plotIds } = await setup();
    const other = rec(farmId, plotIds[1]!, "rain", { mm: 1, readAt: Date.now() });
    await push(owner.token, [other]);
    await call("POST", `/org/records/${other.row.id}/comments`, { token: owner.token, body: { body: "privado" } });
    expect((await call("GET", `/org/records/${other.row.id}/comments`, { token: worker.token })).status).toBe(404);
    expect(await pullAll(worker.token, "comments")).toEqual([]);
    expect((await pullAll(owner.token, "comments")).length).toBe(1);
  });

  it("comenta y borra por sync; no pisa ni borra los de otros; otra organización no entra", async () => {
    const { owner, worker, recordId } = await setup();
    const id = newId();
    const up = (rid = id, body = "hola") => ({
      mutationId: newId(),
      kind: "comments.upsert",
      row: { id: rid, recordId, body, mentions: [owner.userId] },
    });
    const r1 = await push(worker.token, [up()]);
    expect((r1.body as { results: { status: string }[] }).results[0]!.status).toBe("applied");
    const mine = (await pullAll(owner.token, "comments"))[0];
    expect(mine.authorName).toBe("Ramón");
    // otro usuario no edita
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Otra");
    const r2 = await push(agro.token, [up(id, "pisado")]);
    expect((r2.body as { results: { status: string }[] }).results[0]!.status).toBe("rejected");
    // el empleado no borra el de otro; el autor sí
    const del = (cid: string) => ({ mutationId: newId(), kind: "comments.delete", row: { id: cid } });
    const own = await call<{ id: string }>("POST", `/org/records/${recordId}/comments`, { token: owner.token, body: { body: "del dueño" } });
    expect(((await push(worker.token, [del(own.body.id)])).body as { results: { status: string }[] }).results[0]!.status).toBe("rejected");
    expect(((await push(worker.token, [del(id)])).body as { results: { status: string }[] }).results[0]!.status).toBe("applied");
    const outsider = await createOrgWithOwner("Otra org");
    expect((await call("GET", `/org/records/${recordId}/comments`, { token: outsider.token })).status).toBe(404);
  });

  it("la mención genera push y email que salen en el cron", async () => {
    const { owner, agro, recordId } = await setup();
    await call("POST", `/org/records/${recordId}/comments`, { token: owner.token, body: { body: "mirá este lote", mentions: [agro.userId] } });
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    // sin dispositivos el push se da por enviado; el email sale por la consola (sin RESEND_API_KEY)
    const out = await sendMentions(db(), env as never, fetchFn as unknown as typeof fetch);
    expect(out.push).toBeGreaterThanOrEqual(1);
    expect(out.email).toBeGreaterThanOrEqual(1);
    expect((await sendMentions(db(), env as never, fetchFn as unknown as typeof fetch)).push).toBe(0);
  });
});
