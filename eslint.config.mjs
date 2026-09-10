import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Guarda anti-regressão do design system (fase P2).
// As cores neutras cruas (gray/slate/zinc/neutral/stone) e os hex inline em
// classes Tailwind partem o dark mode e a consistência — há sempre um token
// (bg-surface, text-ink, border-hairline, bg-*-bg/text-*-fg, …). Ver
// src/app/globals.css e src/app/dev/ui.
const noRawNeutrals = {
  selector:
    "Literal[value=/(^|\\s|:)(bg|text|border|ring|divide|from|via|to|fill|stroke|placeholder|accent|caret|outline|decoration|shadow)-(gray|slate|zinc|neutral|stone)-[0-9]/]",
  message:
    "Cor neutra crua numa classe Tailwind. Usa um token semântico (bg-surface, bg-surface-sunken, text-ink/-soft/-faint, border-hairline/-strong). Exceções conscientes: adiciona // eslint-disable-next-line no-restricted-syntax com justificação.",
};
const noRawHexClass = {
  selector:
    "Literal[value=/(^|\\s|:)(bg|text|border|ring|from|to)-\\[#[0-9a-fA-F]{3,8}\\]/]",
  message:
    "Hex inline numa classe Tailwind. Define um token em globals.css e usa o utilitário gerado.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", noRawNeutrals, noRawHexClass],
    },
  },
  {
    // Workbench de componentes + mapa de ícones: mostram as cores cruas de
    // propósito. Páginas de auth: vidro fosco sempre-claro sobre gradiente —
    // os tokens de tema não se aplicam ali (migração à parte).
    files: [
      "src/app/dev/ui/**/*.{ts,tsx}",
      "src/components/ui/Icon.tsx",
      "src/app/auth/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
