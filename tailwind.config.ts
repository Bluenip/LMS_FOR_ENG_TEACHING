import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // EngClass Stitch Design System tokens
        brand: {
          indigo: "#4F46E5",
          indigoDeep: "#3525CD",
          indigoSoft: "#EEF2FF",
          orange: "#F97316",
          orangeDeep: "#EA580C",
          orangeSoft: "#FFEDD5",
          mint: "#10B981",
          mintDeep: "#005338",
          mintSoft: "#DCFCE7",
          surface: "#F8F9FF",
          surfaceLow: "#EFF4FF",
          surfaceContainer: "#E5EEFF",
          ink: "#0B1C30",
          inkMuted: "#464555",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04)",
        "card-hover": "0 10px 25px -5px rgba(79, 70, 229, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.03)",
        toolbar: "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
