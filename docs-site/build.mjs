/**
 * Genera la documentación: TypeDoc (Markdown dentro de docs/ts) y después MkDocs.
 * Uso: `node docs-site/build.mjs` construye con `--strict`; con `--serve` levanta el servidor local.
 * @module
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(here, "docs", "ts");

/** Un proceso TypeDoc por paquete: cada uno necesita su propio tsconfig. */
const targets = [
  { name: "shared", dir: "packages/shared", entries: ["src"] },
  { name: "geo", dir: "packages/geo", entries: ["src"] },
  { name: "sync", dir: "packages/sync", entries: ["src"] },
  { name: "api", dir: "apps/api", entries: ["src"] },
  { name: "web", dir: "apps/web", entries: ["src"] },
  { name: "mobile", dir: "apps/mobile", entries: ["src", "app"] },
];

const excludes = ["**/*.test.*", "**/*.spec.*", "**/*.d.ts", "**/*.gen.ts", "**/schema-sql.ts", "**/routes/public/landing/**"];

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, NO_MKDOCS_2_WARNING: "1", DISABLE_MKDOCS_2_WARNING: "true" } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

rmSync(out, { recursive: true, force: true });

for (const t of targets) {
  console.log(`\n== TypeDoc: ${t.dir}`);
  run("pnpm", [
    "exec",
    "typedoc",
    "--plugin",
    "typedoc-plugin-markdown",
    "--entryPointStrategy",
    "expand",
    "--tsconfig",
    join(t.dir, "tsconfig.json"),
    "--out",
    join(out, t.name),
    "--readme",
    "none",
    "--entryFileName",
    "index",
    "--outputFileStrategy",
    "modules",
    "--useHTMLAnchors",
    "--hideBreadcrumbs",
    "--hidePageHeader",
    "--excludeInternal",
    "--skipErrorChecking",
    "--treatWarningsAsErrors",
    "--validation.notExported",
    "false",
    "--name",
    t.name,
    ...excludes.flatMap((e) => ["--exclude", e]),
    ...t.entries.map((e) => join(t.dir, e)),
  ]);
}

/**
 * Los tipos de arreglo (`T[][]`) fuera de código se leen como referencias de mkdocs-autorefs: se escapan los corchetes.
 * Los bloques con cercas y los tramos entre comillas invertidas se dejan como están.
 */
function escapeArrayTypes(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      escapeArrayTypes(path);
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    let fenced = false;
    const lines = readFileSync(path, "utf8")
      .split("\n")
      .map((line) => {
        if (line.startsWith("```")) fenced = !fenced;
        if (fenced || line.startsWith("```")) return line;
        return line
          .split("`")
          .map((part, i) => (i % 2 === 0 ? part.split("[]").join("\\[\\]") : part))
          .join("`");
      });
    writeFileSync(path, lines.join("\n"));
  }
}

escapeArrayTypes(out);

const site = ["run", "--frozen", "--project", here, "--group", "docs", "mkdocs"];
const config = ["-f", join(here, "mkdocs.yml")];
const addr = process.env.DOCS_ADDR ?? "127.0.0.1:8010";
if (process.argv.includes("--serve")) run("uv", [...site, "serve", "-a", addr, ...config]);
else run("uv", [...site, "build", "--strict", ...config]);
