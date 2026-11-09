import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.wrangler/**", "**/worker-configuration.d.ts", "**/migrations/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["apps/api/src/routes/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "drizzle-orm/d1", message: "Las rutas consultan D1 solo vía scopedDb (CLAUDE.md)." }] },
      ],
    },
  },
);
