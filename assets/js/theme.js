(function () {
  const STORAGE_KEY = "mtlColorScheme";
  const DISPLAY_MODE_KEY = "mtlDisplayMode";
  const THEME_STYLE_ID = "mtl-display-mode-style";

  const baseScheme = {
    sidebarBorder: "rgba(255, 255, 255, 0.12)",
    sidebarText: "#d8e5e7",
    textLight: "#9aa7ac",
    dark: {
      accentSoft: "rgba(45, 212, 191, 0.13)",
      goldSoft: "rgba(197, 138, 32, 0.16)",
      border: "rgba(148, 163, 184, 0.18)",
      shadow: "0 18px 42px rgba(0, 0, 0, 0.24)",
      sidebarBorder: "rgba(255, 255, 255, 0.1)",
      surfaceMuted: "#0f1f24",
      surfaceWarm: "#14272a",
      text: "#cbd5d8",
      textLight: "#6f858a",
      textMuted: "#91a4a9",
      textStrong: "#f4fbfb"
    }
  };

  function defineScheme(tokens) {
    return {
      ...baseScheme,
      ...tokens,
      primary: tokens.primary || tokens.accentStrong || tokens.accent,
      primaryHover: tokens.primaryHover || tokens.accentStrong || tokens.accent,
      dark: {
        ...baseScheme.dark,
        ...(tokens.dark || {})
      }
    };
  }

  const schemes = {
    clean: defineScheme({
      label: "Clean",
      accent: "#18d4c3",
      accentStrong: "#0d9fb0",
      accentSoft: "#ddfbf7",
      gold: "#f5b21b",
      goldSoft: "#fff0c7",
      border: "#d8e8eb",
      shadow: "0 14px 34px rgba(5, 11, 22, 0.1)",
      sidebar: "#050b16",
      sidebarMuted: "#8fb4c1",
      sidebarText: "#d9f8f7",
      surfaceMuted: "#f2f8f8",
      surfaceWarm: "#fffaf0",
      text: "#26333a",
      textMuted: "#60747a",
      textStrong: "#07111f",
      stageA: "#18d4c3",
      stageB: "#168de2",
      stageC: "#f5b21b",
      stageD: "#0d9fb0",
      stageE: "#050b16",
      sidebarGradientStart: "#07111f",
      sidebarGradientEnd: "#020611",
      brandGradient: "linear-gradient(135deg, #18d4c3, #168de2 58%, #f5b21b)",
      activeNavIcon: "#18d4c3",
      dark: {
        accentSoft: "rgba(24, 212, 195, 0.14)",
        goldSoft: "rgba(245, 178, 27, 0.16)",
        surfaceMuted: "#06101b",
        surfaceWarm: "#0d1722"
      }
    }),
    ocean: defineScheme({
      label: "Ocean",
      accent: "#1e40af",
      accentStrong: "#1e3a8a",
      accentSoft: "#dbeafe",
      gold: "#0d9488",
      goldSoft: "#ccfbf1",
      border: "#d8e1ee",
      shadow: "0 12px 32px rgba(30, 64, 175, 0.08)",
      sidebar: "#172554",
      sidebarMuted: "#bfdbfe",
      surfaceMuted: "#f6f9fd",
      surfaceWarm: "#f8fafc",
      text: "#26364c",
      textMuted: "#64748b",
      textStrong: "#0f172a",
      stageA: "#1e40af",
      stageB: "#0d9488",
      stageC: "#64748b",
      stageD: "#7c3aed",
      stageE: "#172554",
      sidebarGradientStart: "#1e3a8a",
      sidebarGradientEnd: "#111827",
      brandGradient: "linear-gradient(135deg, #1e40af, #0d9488)",
      activeNavIcon: "#93c5fd",
      dark: {
        accentSoft: "rgba(96, 165, 250, 0.14)",
        goldSoft: "rgba(45, 212, 191, 0.14)",
        surfaceMuted: "#0f172a",
        surfaceWarm: "#111c31"
      }
    }),
    harvest: defineScheme({
      label: "Harvest",
      accent: "#d97706",
      accentStrong: "#b45309",
      accentSoft: "#fef3c7",
      gold: "#d97706",
      goldSoft: "#fef3c7",
      border: "#e2e8f0",
      shadow: "0 12px 32px rgba(15, 23, 42, 0.08)",
      sidebar: "#0f172a",
      sidebarMuted: "#cbd5e1",
      surfaceMuted: "#f8fafc",
      surfaceWarm: "#f7f4ee",
      text: "#334155",
      textMuted: "#64748b",
      textStrong: "#0f172a",
      stageA: "#d97706",
      stageB: "#1e293b",
      stageC: "#b45309",
      stageD: "#64748b",
      stageE: "#0f172a",
      sidebarGradientStart: "#1e293b",
      sidebarGradientEnd: "#020617",
      brandGradient: "linear-gradient(135deg, #d97706, #b45309)",
      activeNavIcon: "#fbbf24",
      dark: {
        accentSoft: "rgba(251, 191, 36, 0.14)",
        goldSoft: "rgba(217, 119, 6, 0.16)",
        surfaceMuted: "#0b1120",
        surfaceWarm: "#111827"
      }
    }),
    slate: defineScheme({
      label: "Slate",
      accent: "#2563eb",
      accentStrong: "#1d4ed8",
      accentSoft: "#dbeafe",
      gold: "#64748b",
      goldSoft: "#f1f5f9",
      border: "#cbd5e1",
      shadow: "0 8px 22px rgba(31, 41, 55, 0.07)",
      sidebar: "#1f2937",
      sidebarMuted: "#d1d5db",
      sidebarText: "#f9fafb",
      surfaceMuted: "#f8fafc",
      surfaceWarm: "#ffffff",
      text: "#1f2937",
      textMuted: "#4b5563",
      textStrong: "#111827",
      stageA: "#2563eb",
      stageB: "#4b5563",
      stageC: "#64748b",
      stageD: "#1d4ed8",
      stageE: "#111827",
      sidebarGradientStart: "#1f2937",
      sidebarGradientEnd: "#111827",
      brandGradient: "linear-gradient(135deg, #2563eb, #1f2937)",
      activeNavIcon: "#93c5fd",
      dark: {
        accentSoft: "rgba(96, 165, 250, 0.16)",
        goldSoft: "rgba(148, 163, 184, 0.14)",
        surfaceMuted: "#111827",
        surfaceWarm: "#1f2937"
      }
    }),
    midnight: defineScheme({
      label: "Midnight",
      accent: "#0f766e",
      accentStrong: "#115e59",
      accentSoft: "#ccfbf1",
      gold: "#111827",
      goldSoft: "#e5e7eb",
      border: "#9ca3af",
      shadow: "0 7px 18px rgba(17, 24, 39, 0.08)",
      sidebar: "#111827",
      sidebarMuted: "#f3f4f6",
      sidebarText: "#ffffff",
      surfaceMuted: "#ffffff",
      surfaceWarm: "#f9fafb",
      text: "#111827",
      textLight: "#6b7280",
      textMuted: "#374151",
      textStrong: "#000000",
      stageA: "#0f766e",
      stageB: "#111827",
      stageC: "#4b5563",
      stageD: "#2563eb",
      stageE: "#000000",
      sidebarGradientStart: "#111827",
      sidebarGradientEnd: "#030712",
      brandGradient: "linear-gradient(135deg, #0f766e, #111827)",
      activeNavIcon: "#5eead4",
      dark: {
        accentSoft: "rgba(45, 212, 191, 0.18)",
        goldSoft: "rgba(229, 231, 235, 0.13)",
        border: "rgba(229, 231, 235, 0.28)",
        surfaceMuted: "#030712",
        surfaceWarm: "#111827",
        text: "#f9fafb",
        textMuted: "#d1d5db",
        textStrong: "#ffffff"
      }
    }),
    evergreen: defineScheme({
      label: "Evergreen",
      accent: "#2f7d62",
      accentStrong: "#124034",
      accentSoft: "#e3f5ec",
      gold: "#b7791f",
      goldSoft: "#fff4d8",
      border: "#d9e6dc",
      shadow: "0 14px 34px rgba(18, 64, 52, 0.1)",
      sidebar: "#124034",
      sidebarMuted: "#b7d7c5",
      sidebarText: "#eefbf3",
      surfaceMuted: "#f4f8f2",
      surfaceWarm: "#fffaf0",
      text: "#26342f",
      textMuted: "#60746b",
      textStrong: "#0f241d",
      stageA: "#2f7d62",
      stageB: "#5f8f4d",
      stageC: "#b7791f",
      stageD: "#316d78",
      stageE: "#124034",
      sidebarGradientStart: "#18513f",
      sidebarGradientEnd: "#0b241d",
      brandGradient: "linear-gradient(135deg, #2f7d62, #124034 62%, #b7791f)",
      activeNavIcon: "#9de3be",
      dark: {
        accentSoft: "rgba(47, 125, 98, 0.18)",
        goldSoft: "rgba(183, 121, 31, 0.16)",
        surfaceMuted: "#0f211b",
        surfaceWarm: "#172721"
      }
    }),
    plum: defineScheme({
      label: "Plum",
      accent: "#7c3aed",
      accentStrong: "#5b21b6",
      accentSoft: "#f0e9ff",
      gold: "#0f766e",
      goldSoft: "#dff8f4",
      border: "#e3ddea",
      shadow: "0 14px 34px rgba(52, 35, 59, 0.1)",
      sidebar: "#34233b",
      sidebarMuted: "#d4c5df",
      sidebarText: "#fbf7ff",
      surfaceMuted: "#faf7fb",
      surfaceWarm: "#f5fbf9",
      text: "#342d39",
      textMuted: "#736679",
      textStrong: "#211525",
      stageA: "#7c3aed",
      stageB: "#0f766e",
      stageC: "#b45309",
      stageD: "#8b5cf6",
      stageE: "#34233b",
      sidebarGradientStart: "#483052",
      sidebarGradientEnd: "#211525",
      brandGradient: "linear-gradient(135deg, #7c3aed, #0f766e)",
      activeNavIcon: "#c4b5fd",
      dark: {
        accentSoft: "rgba(124, 58, 237, 0.16)",
        goldSoft: "rgba(15, 118, 110, 0.16)",
        surfaceMuted: "#201625",
        surfaceWarm: "#251a2a"
      }
    })
  };

  function getResolvedDisplayMode() {
    const preference = getDisplayMode();
    if (preference === "system") {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return preference;
  }

  function displayColors(mode, scheme) {
    if (mode === "dark") {
      const dark = scheme.dark || baseScheme.dark;
      return {
        bgMain: dark.surfaceMuted,
        bgSurface: dark.surfaceWarm,
        bgSurfaceMuted: dark.surfaceMuted,
        textPrimary: dark.textStrong,
        textSecondary: dark.text,
        textMuted: dark.textMuted,
        border: dark.border,
        primaryText: "#ffffff",
        successBg: "#052e16",
        successText: "#86efac",
        warningBg: "#451a03",
        warningText: "#fde68a",
        dangerBg: "#450a0a",
        dangerText: "#fca5a5",
        colorScheme: "dark",
        accentSoft: dark.accentSoft,
        goldSoft: dark.goldSoft,
        shadow: dark.shadow,
        sidebarBorder: dark.sidebarBorder,
        surfaceWarm: dark.surfaceWarm,
        brandGlow: `color-mix(in srgb, ${scheme.accent} 28%, transparent)`
      };
    }

    return {
      bgMain: scheme.surfaceMuted,
      bgSurface: "#ffffff",
      bgSurfaceMuted: scheme.surfaceMuted,
      textPrimary: scheme.textStrong,
      textSecondary: scheme.text,
      textMuted: scheme.textMuted,
      border: scheme.border,
      primaryText: "#ffffff",
      successBg: "#dcfce7",
      successText: "#166534",
      warningBg: scheme.goldSoft,
      warningText: "#92400e",
      dangerBg: "#fee2e2",
      dangerText: "#991b1b",
      colorScheme: "light",
      accentSoft: scheme.accentSoft,
      goldSoft: scheme.goldSoft,
      shadow: scheme.shadow,
      sidebarBorder: scheme.sidebarBorder,
      surfaceWarm: scheme.surfaceWarm,
      brandGlow: `color-mix(in srgb, ${scheme.accentStrong} 18%, transparent)`
    };
  }

  function hexToRgb(hex) {
    const value = String(hex || "").replace("#", "").trim();
    const normalized = value.length === 3
      ? value.split("").map((char) => char + char).join("")
      : value.slice(0, 6);
    const intValue = Number.parseInt(normalized, 16);
    if (Number.isNaN(intValue)) return { r: 0, g: 0, b: 0 };
    return {
      r: (intValue >> 16) & 255,
      g: (intValue >> 8) & 255,
      b: intValue & 255
    };
  }

  function relativeLuminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const values = [r, g, b].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
    return (0.2126 * values[0]) + (0.7152 * values[1]) + (0.0722 * values[2]);
  }

  function readableTextOn(hex) {
    const bg = relativeLuminance(hex);
    const dark = 0;
    const light = 1;
    const contrastWithDark = (Math.max(bg, dark) + 0.05) / (Math.min(bg, dark) + 0.05);
    const contrastWithLight = (Math.max(bg, light) + 0.05) / (Math.min(bg, light) + 0.05);
    return contrastWithDark >= contrastWithLight ? "#0B1320" : "#FFFFFF";
  }

  function applyScheme(key) {
    const scheme = schemes[key] || schemes.clean;
    const root = document.documentElement;
    const displayMode = getResolvedDisplayMode();
    const colors = displayColors(displayMode, scheme);
    const isDarkMode = displayMode === "dark";
    const primaryInk = readableTextOn(scheme.primary);
    const primaryHoverInk = readableTextOn(scheme.primaryHover);
    const accentSoftSafe = colors.accentSoft;
    const navActiveSafe = isDarkMode ? colors.accentSoft : `color-mix(in srgb, ${scheme.primary} 14%, ${scheme.accentSoft})`;
    const hoverSafe = isDarkMode
      ? `color-mix(in srgb, ${scheme.accent} 12%, ${colors.bgSurface})`
      : `color-mix(in srgb, ${scheme.primary} 8%, ${colors.bgSurface})`;
    const activeTextSafe = colors.textPrimary;
    const sidebarGradientStart = scheme.sidebarGradientStart || scheme.sidebar;
    const sidebarGradientEnd = scheme.sidebarGradientEnd || scheme.sidebar;

    root.dataset.colorScheme = schemes[key] ? key : "clean";
    root.dataset.displayPreference = getDisplayMode();
    root.dataset.displayMode = displayMode;
    root.style.setProperty("color-scheme", colors.colorScheme);
    root.style.setProperty("--bg-main", colors.bgMain);
    root.style.setProperty("--bg-surface", colors.bgSurface);
    root.style.setProperty("--bg-surface-muted", colors.bgSurfaceMuted);
    root.style.setProperty("--text-primary", colors.textPrimary);
    root.style.setProperty("--text-secondary", colors.textSecondary);
    root.style.setProperty("--text-muted", colors.textMuted);
    root.style.setProperty("--border", colors.border);
    root.style.setProperty("--primary", scheme.primary);
    root.style.setProperty("--primary-hover", scheme.primaryHover);
    root.style.setProperty("--primary-text", primaryInk);
    root.style.setProperty("--primary-hover-text", primaryHoverInk);
    root.style.setProperty("--success-bg", colors.successBg);
    root.style.setProperty("--success-text", colors.successText);
    root.style.setProperty("--warning-bg", colors.warningBg);
    root.style.setProperty("--warning-text", colors.warningText);
    root.style.setProperty("--danger-bg", colors.dangerBg);
    root.style.setProperty("--danger-text", colors.dangerText);
    root.style.setProperty("--brand-navy", scheme.sidebar);
    root.style.setProperty("--brand-blue", scheme.primary);
    root.style.setProperty("--brand-slate", colors.textMuted);
    root.style.setProperty("--brand-light", colors.border);
    root.style.setProperty("--brand-white", colors.bgSurface);
    root.style.setProperty("--brand-glow", colors.brandGlow);
    root.style.setProperty("--theme-accent", scheme.accent);
    root.style.setProperty("--theme-accent-strong", scheme.accentStrong);
    root.style.setProperty("--theme-accent-soft", accentSoftSafe);
    root.style.setProperty("--theme-gold", scheme.gold);
    root.style.setProperty("--theme-gold-soft", colors.goldSoft);
    root.style.setProperty("--theme-border", colors.border);
    root.style.setProperty("--theme-shadow", colors.shadow);
    root.style.setProperty("--theme-sidebar", scheme.sidebar);
    root.style.setProperty("--theme-sidebar-border", colors.sidebarBorder);
    root.style.setProperty("--theme-sidebar-muted", scheme.sidebarMuted);
    root.style.setProperty("--theme-sidebar-text", scheme.sidebarText);
    root.style.setProperty("--theme-surface-muted", colors.bgSurfaceMuted);
    root.style.setProperty("--theme-surface-warm", colors.surfaceWarm);
    root.style.setProperty("--theme-text", colors.textSecondary);
    root.style.setProperty("--theme-text-light", isDarkMode ? scheme.dark.textLight : scheme.textLight || colors.textMuted);
    root.style.setProperty("--theme-text-muted", colors.textMuted);
    root.style.setProperty("--theme-text-strong", colors.textPrimary);
    root.style.setProperty("--theme-brand-gradient", scheme.brandGradient);
    root.style.setProperty("--theme-sidebar-gradient", `linear-gradient(180deg, ${sidebarGradientStart} 0%, ${scheme.sidebar} 48%, ${sidebarGradientEnd} 100%)`);
    root.style.setProperty("--active-nav-icon", scheme.activeNavIcon);
    root.style.setProperty("--accent-ink", primaryInk);
    root.style.setProperty("--accent-strong-ink", primaryInk);
    root.style.setProperty("--nav-ink", colors.textPrimary);
    root.style.setProperty("--surface-ink", colors.textPrimary);
    root.style.setProperty("--focus-ring", `color-mix(in srgb, ${scheme.primary} 28%, transparent)`);
    root.style.setProperty("--surface-hover", hoverSafe);
    root.style.setProperty("--control-bg", colors.bgSurfaceMuted);
    root.style.setProperty("--control-hover-bg", hoverSafe);
    root.style.setProperty("--danger", colors.dangerText);
    root.style.setProperty("--danger-ink", colors.dangerBg);
    root.style.setProperty("--warning", colors.warningText);
    root.style.setProperty("--warning-ink", colors.warningBg);
    root.style.setProperty("--success", colors.successText);
    root.style.setProperty("--success-ink", colors.successBg);
    root.style.setProperty("--primary-dark", sidebarGradientEnd);
    root.style.setProperty("--accent", scheme.accent);
    root.style.setProperty("--accent-soft", accentSoftSafe);
    root.style.setProperty("--link", scheme.primary);
    root.style.setProperty("--nav-active", navActiveSafe);
    root.style.setProperty("--nav-active-text", activeTextSafe);
    root.style.setProperty("--button-primary-bg", scheme.primary);
    root.style.setProperty("--button-primary-hover", scheme.primaryHover);
    root.style.setProperty("--logo-glow", `color-mix(in srgb, ${scheme.primary} 32%, transparent)`);
    root.style.setProperty("--chart-accent", scheme.accent);
    root.style.setProperty("--bg-light", colors.bgMain);
    root.style.setProperty("--panel-border", colors.border);
    root.style.setProperty("--blue", scheme.primary);
    root.style.setProperty("--teal", scheme.accent);
    root.style.setProperty("--orange", scheme.gold);
    root.style.setProperty("--magenta", scheme.primaryHover);
    root.style.setProperty("--purple", scheme.primaryHover);
    root.style.setProperty("--brand-strong", scheme.primaryHover);
    root.style.setProperty("--soft", colors.bgSurfaceMuted);
    root.style.setProperty("--line", colors.border);
    root.style.setProperty("--brand", scheme.primary);
    root.style.setProperty("--blue-soft", accentSoftSafe);
    root.style.setProperty("--bg", colors.bgMain);
    root.style.setProperty("--bg-2", colors.bgSurface);
    root.style.setProperty("--panel", colors.bgSurface);
    root.style.setProperty("--panel-strong", colors.bgSurfaceMuted);
    root.style.setProperty("--line-strong", scheme.primary);
    root.style.setProperty("--ink", colors.textPrimary);
    root.style.setProperty("--muted", colors.textMuted);
    root.style.setProperty("--body-ink", colors.textPrimary);
    root.style.setProperty("--stage-a", scheme.stageA);
    root.style.setProperty("--stage-b", scheme.stageB);
    root.style.setProperty("--stage-c", scheme.stageC);
    root.style.setProperty("--stage-d", scheme.stageD);
    root.style.setProperty("--stage-e", scheme.stageE);
  }

  function setScheme(key) {
    const normalized = schemes[key] ? key : "clean";
    localStorage.setItem(STORAGE_KEY, normalized);
    applyScheme(normalized);
    window.dispatchEvent(new CustomEvent("mtl-theme-change", { detail: { scheme: normalized } }));
  }

  function getScheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return schemes[stored] ? stored : "clean";
  }

  function setDisplayMode(mode) {
    const normalized = ["light", "dark", "system"].includes(mode) ? mode : "system";
    localStorage.setItem(DISPLAY_MODE_KEY, normalized);
    applyScheme(getScheme());
    window.dispatchEvent(new CustomEvent("mtl-theme-change", { detail: { scheme: getScheme(), displayMode: normalized } }));
  }

  function getDisplayMode() {
    return localStorage.getItem(DISPLAY_MODE_KEY) || "light";
  }

  function installSystemListener() {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const refresh = () => {
      if (getDisplayMode() === "system") applyScheme(getScheme());
    };
    if (media.addEventListener) media.addEventListener("change", refresh);
    else if (media.addListener) media.addListener(refresh);
  }

  function installDisplayModeStyles() {
    let style = document.getElementById(THEME_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = THEME_STYLE_ID;
    }
    style.textContent = `
      [data-color-scheme] body {
        accent-color: var(--primary);
      }
      [data-color-scheme] body,
      [data-color-scheme] .card,
      [data-color-scheme] .panel,
      [data-color-scheme] .table,
      [data-color-scheme] .modal-content,
      [data-color-scheme] .dropdown-menu {
        color: var(--text-primary) !important;
      }
      [data-color-scheme] :is(.card,.panel,.settings-panel,.dashboard-header,.table-panel,.table-wrap,.sheet-table-wrap,.filter-panel,.search-card,.profile-panel,.account-action-card,.account-dashboard-hero,.modal-content,.dropdown-menu) {
        background-color: var(--bg-surface) !important;
        border-color: var(--border) !important;
      }
      [data-color-scheme] :is(.stat-card,.metric-card,.metric,.summary-card,.workspace-card,.lead-card,.client-card,.policy-card,.task-card,.scheme-card,.display-mode-card) {
        background-color: var(--bg-surface) !important;
        color: var(--text-primary) !important;
        border-color: var(--border) !important;
      }
      [data-color-scheme] :is(.detail-list div,.mini-row,.note-row,.empty-state,.table-toolbar,.form-section,.quick-panel,.settings-card) {
        background-color: var(--bg-surface-muted) !important;
        color: var(--text-primary) !important;
        border-color: var(--border) !important;
      }
      [data-color-scheme] :is(p,li,dd,.card p,.panel p,.table-panel p,.profile-panel p,.settings-panel p,.dashboard-header p,.empty-state) {
        color: var(--text-secondary) !important;
      }
      [data-color-scheme] .text-muted,
      [data-color-scheme] .muted,
      [data-color-scheme] small,
      [data-color-scheme] .form-text {
        color: var(--text-muted) !important;
      }
      [data-color-scheme] input,
      [data-color-scheme] select,
      [data-color-scheme] textarea,
      [data-color-scheme] .form-control,
      [data-color-scheme] .form-select {
        background: var(--control-bg) !important;
        color: var(--text-primary) !important;
        border-color: var(--border) !important;
      }
      [data-color-scheme] input::placeholder,
      [data-color-scheme] textarea::placeholder {
        color: var(--text-muted) !important;
        opacity: 1;
      }
      [data-color-scheme] table,
      [data-color-scheme] th,
      [data-color-scheme] td {
        color: var(--text-primary) !important;
        border-color: var(--border) !important;
      }
      [data-color-scheme] thead th {
        color: var(--text-secondary) !important;
        background: var(--bg-surface-muted) !important;
      }
      [data-color-scheme] body.lead-desk-shell :is(.lead-type-tabs button,.preset-row button) {
        background: var(--bg-surface-muted) !important;
        border-color: color-mix(in srgb, var(--primary) 28%, var(--border)) !important;
        color: var(--text-primary) !important;
        box-shadow: none !important;
      }
      [data-color-scheme] body.lead-desk-shell :is(.lead-type-tabs button,.preset-row button):hover,
      [data-color-scheme] body.lead-desk-shell :is(.lead-type-tabs button,.preset-row button):focus-visible {
        background: var(--surface-hover) !important;
        border-color: var(--primary) !important;
        color: var(--text-primary) !important;
        box-shadow: inset 0 -3px 0 var(--primary), 0 0 0 4px var(--focus-ring) !important;
        transform: translateY(-1px);
      }
      [data-color-scheme] body.lead-desk-shell :is(.lead-type-tabs button.active,.preset-row button.active) {
        background: var(--primary) !important;
        border-color: var(--primary) !important;
        color: var(--primary-text) !important;
        box-shadow: 0 10px 24px var(--logo-glow), inset 0 -3px 0 color-mix(in srgb, var(--primary-hover) 72%, #0000) !important;
      }
      [data-display-mode="light"] body.lead-desk-shell .sheet-table thead th,
      [data-display-mode="light"] body.lead-desk-shell .sheet-table thead th button,
      [data-display-mode="light"] body.lead-desk-shell .sheet-table thead .sort-button {
        background: color-mix(in srgb, var(--primary) 8%, var(--bg-surface-muted)) !important;
        color: var(--text-primary) !important;
        border-color: color-mix(in srgb, var(--primary) 20%, var(--border)) !important;
        font-weight: 900 !important;
      }
      [data-color-scheme] a:not(.btn):not(.sidebar-link):not(.home-link),
      [data-color-scheme] .workspace-kicker,
      [data-color-scheme] .kicker,
      [data-color-scheme] .eyebrow,
      [data-color-scheme] .sort-icon {
        color: var(--link) !important;
      }
      [data-color-scheme] .btn-primary,
      [data-color-scheme] .btn-accent,
      [data-color-scheme] button.blue,
      [data-color-scheme] button.primary,
      [data-color-scheme] .home-link:not(.ghost),
      [data-color-scheme] .badge.bg-primary {
        background: var(--button-primary-bg) !important;
        border-color: var(--button-primary-bg) !important;
        color: var(--primary-text) !important;
        box-shadow: 0 12px 28px var(--logo-glow) !important;
      }
      [data-color-scheme] .btn-primary:hover,
      [data-color-scheme] .btn-accent:hover,
      [data-color-scheme] button.blue:hover,
      [data-color-scheme] button.primary:hover,
      [data-color-scheme] .home-link:not(.ghost):hover {
        background: var(--button-primary-hover) !important;
        border-color: var(--button-primary-hover) !important;
        color: var(--primary-hover-text) !important;
      }
      [data-color-scheme] .sidebar-link:hover,
      [data-color-scheme] .sidebar-link.active,
      [data-color-scheme] .display-mode-card.active,
      [data-color-scheme] .scheme-card.active,
      [data-color-scheme] .quick-chip-row button.active,
      [data-color-scheme] .preset-row button.active,
      [data-color-scheme] .filter-pill.active,
      [data-color-scheme] .chip.active {
        background: var(--nav-active) !important;
        border-color: var(--primary) !important;
        color: var(--nav-active-text) !important;
        box-shadow: inset 3px 0 0 var(--primary) !important;
      }
      [data-color-scheme] body.dashboard-body .dashboard-sidebar .sidebar-link:hover,
      [data-color-scheme] body.dashboard-body .dashboard-sidebar .sidebar-link.active,
      [data-color-scheme] body.analytics-body .app-topbar .sidebar-link:hover,
      [data-color-scheme] body.analytics-body .app-topbar .sidebar-link.active,
      [data-color-scheme] body.product-shell > header .sidebar-link:hover,
      [data-color-scheme] body.product-shell > header .sidebar-link.active,
      [data-color-scheme] body.dashboard-body :is(.display-mode-card.active,.scheme-card.active,.quick-chip-row button.active,.preset-row button.active,.filter-pill.active,.chip.active),
      [data-color-scheme] body.analytics-body :is(.quick-chip-row button.active,.preset-row button.active,.filter-pill.active,.chip.active),
      [data-color-scheme] body.product-shell :is(.quick-chip-row button.active,.preset-row button.active,.filter-pill.active,.chip.active) {
        background: var(--nav-active) !important;
        border-color: var(--primary) !important;
        color: var(--nav-active-text) !important;
        box-shadow: inset 3px 0 0 var(--primary) !important;
      }
      [data-color-scheme] .btn-outline-primary,
      [data-color-scheme] .btn-outline-secondary,
      [data-color-scheme] button.secondary,
      [data-color-scheme] .home-link.ghost,
      [data-color-scheme] .chip,
      [data-color-scheme] .pill,
      [data-color-scheme] .quick-chip-row button,
      [data-color-scheme] .preset-row button,
      [data-color-scheme] .filter-pill {
        border-color: color-mix(in srgb, var(--primary) 34%, var(--border)) !important;
        color: var(--text-primary) !important;
      }
      [data-color-scheme] .btn-outline-primary:hover,
      [data-color-scheme] .btn-outline-secondary:hover,
      [data-color-scheme] button.secondary:hover,
      [data-color-scheme] .chip:hover,
      [data-color-scheme] .pill:hover,
      [data-color-scheme] .quick-chip-row button:hover,
      [data-color-scheme] .preset-row button:hover,
      [data-color-scheme] .filter-pill:hover,
      [data-color-scheme] .sort-button:hover {
        background: var(--surface-hover) !important;
        border-color: var(--primary) !important;
        color: var(--text-primary) !important;
      }
      [data-color-scheme] body.dashboard-body :is(.btn-outline-primary,.btn-outline-secondary,button.secondary,.home-link.ghost,.chip,.pill,.quick-chip-row button,.preset-row button,.filter-pill,.sort-button):hover,
      [data-color-scheme] body.analytics-body :is(.btn-outline-primary,.btn-outline-secondary,button.secondary,.home-link.ghost,.chip,.pill,.quick-chip-row button,.preset-row button,.filter-pill,.sort-button):hover,
      [data-color-scheme] body.product-shell :is(.btn-outline-primary,.btn-outline-secondary,button.secondary,.home-link.ghost,.chip,.pill,.quick-chip-row button,.preset-row button,.filter-pill,.sort-button):hover {
        background: var(--surface-hover) !important;
        border-color: var(--primary) !important;
        color: var(--text-primary) !important;
      }
      [data-color-scheme] input:hover,
      [data-color-scheme] select:hover,
      [data-color-scheme] textarea:hover,
      [data-color-scheme] .form-control:hover,
      [data-color-scheme] .form-select:hover {
        border-color: color-mix(in srgb, var(--primary) 48%, var(--border)) !important;
      }
      [data-color-scheme] input:focus,
      [data-color-scheme] select:focus,
      [data-color-scheme] textarea:focus,
      [data-color-scheme] .form-control:focus,
      [data-color-scheme] .form-select:focus,
      [data-color-scheme] button:focus-visible,
      [data-color-scheme] .btn:focus-visible,
      [data-color-scheme] a:focus-visible {
        border-color: var(--primary) !important;
        box-shadow: 0 0 0 4px var(--focus-ring) !important;
        outline: none !important;
      }
      [data-color-scheme] tbody tr:hover,
      [data-color-scheme] tbody tr:hover td {
        box-shadow: inset 3px 0 0 var(--primary) !important;
      }
      [data-color-scheme] .brand-mark,
      [data-color-scheme] .brand .mark,
      [data-color-scheme] .dashboard-brand img,
      [data-color-scheme] .owner-brand img {
        box-shadow: 0 12px 28px var(--logo-glow) !important;
      }
      [data-color-scheme] .scheme-cta,
      [data-color-scheme] .chart-accent,
      [data-color-scheme] .progress-bar,
      [data-color-scheme] .lead-activity-line {
        background: var(--chart-accent) !important;
      }
      [data-color-scheme] .lead-checkbox,
      [data-color-scheme] input[type="checkbox"],
      [data-color-scheme] input[type="radio"] {
        accent-color: var(--primary) !important;
      }
      [data-color-scheme] body.lead-desk-shell :is(.lead-type-tabs button:not(.active),.preset-row button:not(.active)) {
        background: var(--bg-surface-muted) !important;
        border-color: color-mix(in srgb, var(--primary) 28%, var(--border)) !important;
        color: var(--text-primary) !important;
        box-shadow: none !important;
      }
      [data-color-scheme] body.lead-desk-shell :is(.lead-type-tabs button:not(.active),.preset-row button:not(.active)):hover,
      [data-color-scheme] body.lead-desk-shell :is(.lead-type-tabs button:not(.active),.preset-row button:not(.active)):focus-visible {
        background: var(--surface-hover) !important;
        border-color: var(--primary) !important;
        color: var(--text-primary) !important;
        box-shadow: inset 0 -3px 0 var(--primary), 0 0 0 4px var(--focus-ring) !important;
        transform: translateY(-1px);
      }
      [data-color-scheme] body.lead-desk-shell :is(.lead-type-tabs button.active,.preset-row button.active) {
        background: var(--primary) !important;
        border-color: var(--primary) !important;
        color: var(--primary-text) !important;
        box-shadow: 0 10px 24px var(--logo-glow), inset 0 -3px 0 color-mix(in srgb, var(--primary-hover) 72%, #0000) !important;
      }
      [data-color-scheme] body.lead-desk-shell :is(#newTab:not(.active),#renewalTab:not(.active),#presetRow button:not(.active)) {
        background: var(--bg-surface-muted) !important;
        border-color: color-mix(in srgb, var(--primary) 28%, var(--border)) !important;
        color: var(--text-primary) !important;
        box-shadow: none !important;
      }
      [data-color-scheme] body.lead-desk-shell :is(#newTab:not(.active),#renewalTab:not(.active),#presetRow button:not(.active)):hover,
      [data-color-scheme] body.lead-desk-shell :is(#newTab:not(.active),#renewalTab:not(.active),#presetRow button:not(.active)):focus-visible {
        background: var(--surface-hover) !important;
        border-color: var(--primary) !important;
        color: var(--text-primary) !important;
        box-shadow: inset 0 -3px 0 var(--primary), 0 0 0 4px var(--focus-ring) !important;
        transform: translateY(-1px);
      }
      [data-color-scheme] body.lead-desk-shell :is(#newTab.active,#renewalTab.active,#presetRow button.active) {
        background: var(--primary) !important;
        border-color: var(--primary) !important;
        color: var(--primary-text) !important;
        box-shadow: 0 10px 24px var(--logo-glow), inset 0 -3px 0 color-mix(in srgb, var(--primary-hover) 72%, #0000) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function keepThemeStyleLast() {
    const style = document.getElementById(THEME_STYLE_ID);
    if (style && style.parentNode === document.head) {
      document.head.appendChild(style);
    }
  }

  function installThemeStyleOrderGuards() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", keepThemeStyleLast, { once: true });
    } else {
      keepThemeStyleLast();
    }
    window.addEventListener("load", keepThemeStyleLast, { once: true });
  }
  window.MyTruckingLeadsTheme = {
    schemes,
    getScheme,
    setScheme,
    applyScheme,
    getDisplayMode,
    setDisplayMode,
    getResolvedDisplayMode
  };

  installDisplayModeStyles();
  installThemeStyleOrderGuards();
  installSystemListener();
  applyScheme(getScheme());
})();
