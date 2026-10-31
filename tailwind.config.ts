import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16211B",
        muted: "#5B685F",
        paper: "#F5F7F1",
        card: "#FFFFFF",
        line: "#D9E0D3",
        pista: { DEFAULT: "#1E4A37", deep: "#123224", soft: "#E2ECD5", kernel: "#B9D18F" },
        jute: { DEFAULT: "#A9824F", soft: "#EFE4D2" },
        saffron: { DEFAULT: "#E19A2B", soft: "#FBEBCD" },
        danger: { DEFAULT: "#A8352B", soft: "#F7DDD9" },
      },
      fontFamily: {
        sans: ['"Instrument Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        stencil: ['"Big Shoulders Stencil Display"', '"Arial Narrow"', "Impact", "sans-serif"],
      },
      borderRadius: { DEFAULT: "6px" },
      maxWidth: { shell: "1200px" },
    },
  },
  plugins: [],
} satisfies Config;
