import type { Config } from "tailwindcss";
const colors = Object.fromEntries(
  [
    "border",
    "input",
    "ring",
    "background",
    "foreground",
    "primary",
    "secondary",
    "destructive",
    "muted",
    "accent",
    "popover",
    "card",
  ].map((k) => [
    k,
    [
      "primary",
      "secondary",
      "destructive",
      "muted",
      "accent",
      "popover",
      "card",
    ].includes(k)
      ? {
          DEFAULT: `hsl(var(--studio-${k}))`,
          foreground: `hsl(var(--studio-${k}-foreground))`,
        }
      : `hsl(var(--studio-${k}))`,
  ]),
);
export default {
  content: ["./src/features/studio/**/*.{ts,tsx}"],
  important: ".n7-studio",
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors,
      borderRadius: { lg: ".75rem", md: ".5rem", sm: ".25rem" },
    },
  },
  plugins: [],
} satisfies Config;
