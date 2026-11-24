/** Pruebas de caché de lecturas en línea. */
import { describe, expect, it } from "vitest";
import { LOCAL_SCHEMA } from "../src/db/sql";
import {
  CACHE_MAX_ENTRY_BYTES,
  cacheClear,
  cacheGet,
  cacheInvalidate,
  cacheKey,
  cachePut,
  isCacheable,
  isExpired,
  matchesPrefix,
  shouldCache,
  utf8Bytes,
} from "../src/office/httpCache";
import { nodeSql } from "./node-sql";

const db = () => {
  const sql = nodeSql();
  for (const s of LOCAL_SCHEMA) sql.run(s);
  return sql;
};
const put = (sql: ReturnType<typeof db>, path: string, body: string, now: number, user = "u1", org = "o1") => cachePut(sql, { userId: user, orgId: org, path, body, now });

describe("caché de lecturas en línea", () => {
  it("la clave junta usuario, organización y path", () => {
    expect(cacheKey("u1", "o1", "/org/review")).toBe("u1|o1|/org/review");
    expect(cacheKey("u1", "o2", "/org/review")).not.toBe(cacheKey("u1", "o1", "/org/review"));
  });

  it("nunca cachea el ERP, aunque la pantalla lo pida", () => {
    expect(isCacheable("/org/erp/cash")).toBe(false);
    expect(isCacheable("/org/erp/purchases?x=1")).toBe(false);
    expect(isCacheable("/org/review")).toBe(true);
    expect(shouldCache("/org/erp/cash", true)).toBe(false);
    expect(shouldCache("/org/erp/cash", undefined)).toBe(false);
    expect(shouldCache("/org/review", false)).toBe(false);
    expect(shouldCache("/org/review", undefined)).toBe(true);
    const sql = db();
    expect(put(sql, "/org/erp/cash", "{}", 1)).toBe(false);
    expect(sql.get("SELECT 1 AS x FROM http_cache")).toBeUndefined();
  });

  it("guarda y lee con su fecha", () => {
    const sql = db();
    expect(put(sql, "/a", '{"n":1}', 1000)).toBe(true);
    expect(cacheGet(sql, cacheKey("u1", "o1", "/a"))).toEqual({ body: '{"n":1}', fetchedAt: 1000 });
    expect(cacheGet(sql, cacheKey("u2", "o1", "/a"))).toBeNull();
  });

  it("rechaza entradas de más de 200 KB y borra la copia vieja", () => {
    const sql = db();
    put(sql, "/big", "{}", 1);
    const big = "x".repeat(CACHE_MAX_ENTRY_BYTES + 1);
    expect(put(sql, "/big", big, 2)).toBe(false);
    expect(cacheGet(sql, cacheKey("u1", "o1", "/big"))).toBeNull();
    expect(put(sql, "/ok", "x".repeat(CACHE_MAX_ENTRY_BYTES), 3)).toBe(true);
  });

  it("al pasar el tope total borra las más viejas, no la recién guardada", () => {
    const sql = db();
    const limits = { entry: 100, total: 250 };
    for (const [i, p] of ["/1", "/2", "/3"].entries()) cachePut(sql, { userId: "u", orgId: "o", path: p, body: "x".repeat(100), now: i + 1 }, limits);
    const keys = sql.all<{ path: string }>("SELECT path FROM http_cache ORDER BY fetched_at").map((r) => r.path);
    expect(keys).toEqual(["/2", "/3"]);
  });

  it("invalida por prefijo solo de este usuario y organización", () => {
    const sql = db();
    put(sql, "/org/review", "[]", 1);
    put(sql, "/org/review?farm=1", "[]", 1);
    put(sql, "/org/tasks", "[]", 1);
    put(sql, "/org/review", "[]", 1, "u2");
    expect(cacheInvalidate(sql, "u1", "o1", ["/org/review"])).toBe(2);
    expect(sql.all<{ path: string; user_id: string }>("SELECT path, user_id FROM http_cache ORDER BY path, user_id").map((r) => `${r.user_id}${r.path}`)).toEqual(["u2/org/review", "u1/org/tasks"]);
    expect(matchesPrefix("/org/review?x", ["/a", "/org/review"])).toBe(true);
  });

  it("clear borra todo (cierre de sesión, cambio de usuario u organización)", () => {
    const sql = db();
    put(sql, "/a", "{}", 1);
    cacheClear(sql);
    expect(sql.get("SELECT 1 AS x FROM http_cache")).toBeUndefined();
  });

  it("expiración por ttl", () => {
    expect(isExpired(1000, 500, 1400)).toBe(false);
    expect(isExpired(1000, 500, 1501)).toBe(true);
  });

  it("cuenta bytes UTF-8", () => {
    expect(utf8Bytes("abc")).toBe(3);
    expect(utf8Bytes("ñ")).toBe(2);
    expect(utf8Bytes("€")).toBe(3);
    expect(utf8Bytes("😀")).toBe(4);
  });
});
