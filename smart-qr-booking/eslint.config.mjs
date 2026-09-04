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
  ]),
  {
    rules: {
      // Curly apostrophes in guest-facing copy are intentional, not bugs.
      "react/no-unescaped-entities": "off",
      // Post-mount hydration from localStorage / pathname is deliberate here
      // (SSR renders the default, the client fills in browser-only state).
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
