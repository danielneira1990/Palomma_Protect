import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Servicio de scoring: es Python. Su .venv/.uv-cache traen JS vendorizado
    // enorme (plotly.min.js, etc.) que hacía reventar a eslint por memoria.
    "scoring-service/**",
  ]),
]);

export default eslintConfig;
