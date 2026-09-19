import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  { ignores: ["node_modules/**", "out/**", "build/**", ".local/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["src/composition/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now" },
        { object: "Math", property: "random" },
      ],
      "no-restricted-globals": ["error", "fetch", "Date"],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "**/infrastructure/**",
            "**/ports/**",
            "**/application/**",
            "**/domain/**",
            "**/snapshot/compile",
            "**/snapshot/hash",
            "node:*",
          ],
        },
      ],
    },
  },
);
