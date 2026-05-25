import { createContext, useContext, useState, useEffect, useCallback } from "react";

const ThemeContext = createContext(null);

const ACCENT_COLORS = {
  blue: { 400: "#3B93FF", 500: "#1570EF", 600: "#1252B5" },
  teal: { 400: "#2DD4BF", 500: "#14B8A6", 600: "#0D9488" },
  emerald: { 400: "#34D399", 500: "#10B981", 600: "#059669" },
  amber: { 400: "#FBBF24", 500: "#F59E0B", 600: "#D97706" },
  rose: { 400: "#FB7185", 500: "#F43F5E", 600: "#E11D48" },
  slate: { 400: "#94A3B8", 500: "#64748B", 600: "#475569" },
};

function getEffectiveTheme(theme) {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeRaw] = useState(() => localStorage.getItem("mtl_theme") || "dark");
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem("mtl_accent") || "blue");
  const [crmLayout, setCrmLayout] = useState(() => localStorage.getItem("mtl_crm_layout") || "kanban");

  const applyTheme = useCallback((t) => {
    const effective = getEffectiveTheme(t);
    const root = document.documentElement;

    if (effective === "light") {
      root.classList.add("light");
      root.style.setProperty("--bg-primary", "#ffffff");
      root.style.setProperty("--bg-secondary", "#f8fafc");
      root.style.setProperty("--bg-tertiary", "#f1f5f9");
      root.style.setProperty("--bg-surface", "#ffffff");
      root.style.setProperty("--bg-elevated", "#ffffff");
      root.style.setProperty("--border-color", "#e2e8f0");
      root.style.setProperty("--border-subtle", "#f1f5f9");
      root.style.setProperty("--text-primary", "#0f172a");
      root.style.setProperty("--text-secondary", "#475569");
      root.style.setProperty("--text-tertiary", "#94a3b8");
      root.style.setProperty("--text-inverse", "#ffffff");
      root.style.setProperty("--sidebar-bg", "#1e293b");
      root.style.setProperty("--sidebar-text", "#e2e8f0");
    } else {
      root.classList.remove("light");
      root.style.setProperty("--bg-primary", "#0a0e1a");
      root.style.setProperty("--bg-secondary", "#0f1629");
      root.style.setProperty("--bg-tertiary", "#141c33");
      root.style.setProperty("--bg-surface", "rgba(255,255,255,0.03)");
      root.style.setProperty("--bg-elevated", "rgba(255,255,255,0.05)");
      root.style.setProperty("--border-color", "rgba(255,255,255,0.06)");
      root.style.setProperty("--border-subtle", "rgba(255,255,255,0.03)");
      root.style.setProperty("--text-primary", "#ffffff");
      root.style.setProperty("--text-secondary", "#94a3b8");
      root.style.setProperty("--text-tertiary", "#475569");
      root.style.setProperty("--text-inverse", "#0f172a");
      root.style.setProperty("--sidebar-bg", "rgba(15,22,41,0.5)");
      root.style.setProperty("--sidebar-text", "#e2e8f0");
    }
  }, []);

  const setTheme = useCallback((t) => {
    setThemeRaw(t);
    localStorage.setItem("mtl_theme", t);
    applyTheme(t);
  }, [applyTheme]);

  useEffect(() => {
    applyTheme(theme);
  }, []);

  useEffect(() => {
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme, applyTheme]);

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
