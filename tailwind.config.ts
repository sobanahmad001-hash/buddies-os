import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        "surface-subtle": "var(--surface-subtle)",
        "surface-raised": "var(--surface-raised)",
        ink: "var(--text)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        line: "var(--border)",
        "line-strong": "var(--border-strong)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        positive: "var(--positive)",
        caution: "var(--caution)",
        risk: "var(--risk)",
      },
      boxShadow: { panel: "var(--shadow)" },
      borderRadius: { panel: "14px" },
    },
  },
  plugins: [],
};

export default config;
