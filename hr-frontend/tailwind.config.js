/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
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
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        gold: {
          DEFAULT: "#c8a45c",
          light: "#d4b675",
          50: "#fdf8ef",
          100: "#f8ecd3",
          200: "#f0d9a8",
          300: "#e6c078",
          400: "#d9a95a",
          500: "#c8a45c",
          600: "#b8934c",
          700: "#9c7a3d",
          800: "#7d6231",
          900: "#5f4a25",
        },
        forest: {
          DEFAULT: "#1e3a2f",
          hover: "#2d5544",
          50: "#eef5f1",
          100: "#d7e8de",
          200: "#b0d1bd",
          300: "#85b89a",
          400: "#5c9d79",
          500: "#3d7d5c",
          600: "#2d5544",
          700: "#1e3a2f",
          800: "#16291f",
          900: "#0e1a14",
        },
        cream: {
          DEFAULT: "#f5efe4",
          dark: "#ebe3d3",
        },
      },
      fontFamily: {
        serif: ["'Playfair Display'", "Georgia", "serif"],
        heading: ["'Playfair Display'", "Georgia", "serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}

