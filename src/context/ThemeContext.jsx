import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext(null);

const ACCENT_COLORS = {
  blue: { 400: "#3B93FF", 500: "#1570EF", 600: "#1252B5" },
  teal: { 400: "#2DD4BF", 500: "#14B8A6", 600: "#0D9488" },
  emerald: { 400: "#34D399", 500: "#10B981", 600: "#059669" },
  amber: { 400: "#FBBF24", 500: "#F59E0B", 600: "#D97706" },
  rose: { 400: "#FB7185", 500: "#F43F5E", 600: "#E11D48" },
  slate: { 400: "#94A3B8", 500: "#64748B", 600: "#475569" },
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("mtl_theme") || "dark");
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem("mtl_accent") || "blue");
  const [crmLayout, setCrmLayout] = useState(() => localStorage.getItem("mtl_crm_layout") || "kanban");

  useEffect(() => {
    localStorage.setItem("mtl_theme", theme);
    const root = document.documentElement;

    root.classList.remove("theme-dark", "theme-light");

    let effectiveTheme = theme;
    if (theme === "system") {
      effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    root.classList.add(`theme-${effectiveTheme}`);
    root.setAttribute("data-theme", effectiveTheme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("mtl_accent", accentColor);
    const root = document.documentElement;
    const colors = ACCENT_COLORS[accentColor] || ACCENT_COLORS.blue;
    root.style.setProperty("--accent-brand-400", colors[400]);
    root.style.setProperty("--accent-brand-500", colors[500]);
    root.style.setProperty("--accent-brand-600", colors[600]);
  }, [accentColor]);

  useEffect(() => {
    localStorage.setItem("mtl_crm_layout", crmLayout);
  }, [crmLayout]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, accentColor, setAccentColor, crmLayout, setCrmLayout }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
