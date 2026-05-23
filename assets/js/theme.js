(function () {
  const FIXED_SCHEME = "slate";
  const FIXED_MODE = "dark";
  const THEME_STYLE_ID = "mtl-display-mode-style";

  const schemes = {
    slate: {
      label: "Slate",
      primary: "#3b82f6",
      primaryHover: "#60a5fa",
      accent: "#2563eb",
      accentStrong: "#1d4ed8",
      accentSoft: "rgba(96, 165, 250, 0.16)",
      gold: "#94a3b8",
      goldSoft: "rgba(148, 163, 184, 0.14)",
      border: "rgba(148, 163, 184, 0.2)",
      shadow: "0 22px 70px rgba(0, 0, 0, 0.32)",
      sidebar: "#111827",
      sidebarMuted: "#94a3b8",
      sidebarText: "#f8fafc",
      surfaceMuted: "#0f172a",
      surfaceWarm: "#111827",
      text: "#cbd5e1",
      textLight: "#64748b",
      textMuted: "#94a3b8",
      textStrong: "#f8fafc",
      stageA: "#3b82f6",
      stageB: "#64748b",
      stageC: "#94a3b8",
      stageD: "#60a5fa",
      stageE: "#020617",
      sidebarGradientStart: "#1f2937",
      sidebarGradientEnd: "#020617",
      brandGradient: "linear-gradient(135deg, #3b82f6, #111827)",
      activeNavIcon: "#93c5fd"
    }
  };

  function applySlateDark() {
    const scheme = schemes.slate;
    const root = document.documentElement;

    localStorage.setItem("mtlColorScheme", FIXED_SCHEME);
    localStorage.setItem("mtlDisplayMode", FIXED_MODE);

    root.dataset.colorScheme = FIXED_SCHEME;
    root.dataset.displayPreference = FIXED_MODE;
    root.dataset.displayMode = FIXED_MODE;
    root.style.setProperty("color-scheme", "dark");

    root.style.setProperty("--bg-main", "#0f172a");
    root.style.setProperty("--bg-surface", "#111827");
    root.style.setProperty("--bg-surface-muted", "#0f172a");
    root.style.setProperty("--text-primary", "#f8fafc");
    root.style.setProperty("--text-secondary", "#cbd5e1");
    root.style.setProperty("--text-muted", "#94a3b8");
    root.style.setProperty("--border", "rgba(148, 163, 184, 0.2)");
    root.style.setProperty("--primary", scheme.primary);
    root.style.setProperty("--primary-hover", scheme.primaryHover);
    root.style.setProperty("--primary-text", "#ffffff");
    root.style.setProperty("--primary-hover-text", "#ffffff");
    root.style.setProperty("--success-bg", "#052e16");
    root.style.setProperty("--success-text", "#86efac");
    root.style.setProperty("--warning-bg", "#451a03");
    root.style.setProperty("--warning-text", "#fde68a");
    root.style.setProperty("--danger-bg", "#450a0a");
    root.style.setProperty("--danger-text", "#fca5a5");
    root.style.setProperty("--brand-navy", scheme.sidebar);
    root.style.setProperty("--brand-blue", scheme.primary);
    root.style.setProperty("--brand-slate", scheme.textMuted);
    root.style.setProperty("--brand-light", "rgba(148, 163, 184, 0.2)");
    root.style.setProperty("--brand-white", "#111827");
    root.style.setProperty("--brand-glow", "rgba(59, 130, 246, 0.28)");
    root.style.setProperty("--theme-accent", scheme.accent);
    root.style.setProperty("--theme-accent-strong", scheme.accentStrong);
    root.style.setProperty("--theme-accent-soft", scheme.accentSoft);
    root.style.setProperty("--theme-gold", scheme.gold);
    root.style.setProperty("--theme-gold-soft", scheme.goldSoft);
    root.style.setProperty("--theme-border", scheme.border);
    root.style.setProperty("--theme-shadow", scheme.shadow);
    root.style.setProperty("--theme-sidebar", scheme.sidebar);
    root.style.setProperty("--theme-sidebar-border", "rgba(255, 255, 255, 0.1)");
    root.style.setProperty("--theme-sidebar-muted", scheme.sidebarMuted);
    root.style.setProperty("--theme-sidebar-text", scheme.sidebarText);
    root.style.setProperty("--theme-surface-muted", scheme.surfaceMuted);
    root.style.setProperty("--theme-surface-warm", scheme.surfaceWarm);
    root.style.setProperty("--theme-text", scheme.text);
    root.style.setProperty("--theme-text-light", scheme.textLight);
    root.style.setProperty("--theme-text-muted", scheme.textMuted);
    root.style.setProperty("--theme-text-strong", scheme.textStrong);
    root.style.setProperty("--theme-brand-gradient", scheme.brandGradient);
    root.style.setProperty("--theme-sidebar-gradient", `linear-gradient(180deg, ${scheme.sidebarGradientStart} 0%, ${scheme.sidebar} 48%, ${scheme.sidebarGradientEnd} 100%)`);
    root.style.setProperty("--active-nav-icon", scheme.activeNavIcon);
    root.style.setProperty("--accent-ink", "#ffffff");
    root.style.setProperty("--accent-strong-ink", "#ffffff");
    root.style.setProperty("--nav-ink", "#f8fafc");
    root.style.setProperty("--surface-ink", "#f8fafc");
    root.style.setProperty("--focus-ring", "rgba(59, 130, 246, 0.28)");
    root.style.setProperty("--surface-hover", "rgba(59, 130, 246, 0.12)");
    root.style.setProperty("--control-bg", "#0f172a");
    root.style.setProperty("--control-hover-bg", "rgba(59, 130, 246, 0.12)");
    root.style.setProperty("--danger", "#fca5a5");
    root.style.setProperty("--danger-ink", "#450a0a");
    root.style.setProperty("--warning", "#fde68a");
    root.style.setProperty("--warning-ink", "#451a03");
    root.style.setProperty("--success", "#86efac");
    root.style.setProperty("--success-ink", "#052e16");
    root.style.setProperty("--primary-dark", scheme.sidebarGradientEnd);
    root.style.setProperty("--accent", scheme.accent);
    root.style.setProperty("--accent-soft", scheme.accentSoft);
    root.style.setProperty("--link", scheme.primaryHover);
    root.style.setProperty("--nav-active", "rgba(59, 130, 246, 0.16)");
    root.style.setProperty("--nav-active-text", "#f8fafc");
    root.style.setProperty("--button-primary-bg", scheme.primary);
    root.style.setProperty("--button-primary-hover", scheme.primaryHover);
    root.style.setProperty("--logo-glow", "rgba(59, 130, 246, 0.32)");
    root.style.setProperty("--chart-accent", scheme.primaryHover);
    root.style.setProperty("--bg-light", "#0f172a");
    root.style.setProperty("--panel-border", "rgba(148, 163, 184, 0.2)");
    root.style.setProperty("--blue", scheme.primary);
    root.style.setProperty("--teal", scheme.primaryHover);
    root.style.setProperty("--orange", scheme.gold);
    root.style.setProperty("--magenta", scheme.primaryHover);
    root.style.setProperty("--purple", scheme.primaryHover);
    root.style.setProperty("--brand-strong", scheme.primaryHover);
    root.style.setProperty("--soft", "#0f172a");
    root.style.setProperty("--line", "rgba(148, 163, 184, 0.2)");
    root.style.setProperty("--brand", scheme.primary);
    root.style.setProperty("--blue-soft", scheme.accentSoft);
    root.style.setProperty("--bg", "#0f172a");
    root.style.setProperty("--bg-2", "#111827");
    root.style.setProperty("--panel", "#111827");
    root.style.setProperty("--panel-strong", "#1f2937");
    root.style.setProperty("--line-strong", scheme.primary);
    root.style.setProperty("--ink", "#f8fafc");
    root.style.setProperty("--muted", "#94a3b8");
    root.style.setProperty("--body-ink", "#f8fafc");
    root.style.setProperty("--stage-a", scheme.stageA);
    root.style.setProperty("--stage-b", scheme.stageB);
    root.style.setProperty("--stage-c", scheme.stageC);
    root.style.setProperty("--stage-d", scheme.stageD);
    root.style.setProperty("--stage-e", scheme.stageE);
  }

  function installFixedThemeStyles() {
    let style = document.getElementById(THEME_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = THEME_STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = `
      [data-color-scheme] body {
        accent-color: var(--primary);
      }
      [data-color-scheme] :is(.dashboard-body,.analytics-body,.owner-body,.product-shell,.marketplace-body,.quote-request-body) {
        background:
          radial-gradient(circle at 16% -8%, rgba(59, 130, 246, 0.18), transparent 28rem),
          radial-gradient(circle at 92% 0%, rgba(96, 165, 250, 0.08), transparent 24rem),
          linear-gradient(180deg, #020617 0%, #0f172a 42%, #111827 100%) !important;
        color: var(--text-primary) !important;
      }
      [data-color-scheme] :is(.card,.panel,.dashboard-header,.settings-panel,.settings-stat-grid div,.settings-access-list span,.sheet-table-wrap,.table-wrap,.filter-panel,.table-panel,.search-card,.profile-panel,.modal-content,.detail-card,.mini-field,.prospect-card,.column,.owner-card,.owner-command-card,.metric,.metric-card,.stat,.stat-card,.analytics-search-panel,.analytics-profile-card,.carrier-rich-section,.carrier-rich-grid div,.carrier-detail-grid div,.carrier-safety-stats div,.display-mode-card,.scheme-card,.chart-container,.activity-timeline,.login-notice,.trial-banner) {
        background: linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(15, 23, 42, 0.96)) !important;
        border-color: var(--border) !important;
        color: var(--text-primary) !important;
        box-shadow: none !important;
      }
      [data-color-scheme] :is(h1,h2,h3,h4,h5,h6,strong,b,label,th,.metric-value,.cell-main,.card-name) {
        color: var(--text-primary) !important;
      }
      [data-color-scheme] :is(p,li,dd,td,small,.small,.text-muted,.muted,.subtle,.cell-sub,.metric-detail,.form-text,.dashboard-user,.user-line) {
        color: var(--text-secondary) !important;
      }
      [data-color-scheme] :is(input,select,textarea,.form-control,.form-select,.input-group-text) {
        background: var(--control-bg) !important;
        border-color: var(--border) !important;
        color: var(--text-primary) !important;
      }
      [data-color-scheme] :is(input,textarea,.form-control)::placeholder {
        color: var(--text-muted) !important;
        opacity: 1;
      }
      [data-color-scheme] :is(table,.table,.sheet-table,.mini-table) {
        background: transparent !important;
        color: var(--text-primary) !important;
        border-color: var(--border) !important;
      }
      [data-color-scheme] :is(thead th,.sheet-table thead th,.mini-table th) {
        background: #0f172a !important;
        color: var(--text-secondary) !important;
        border-color: var(--border) !important;
      }
      [data-color-scheme] :is(tbody td,.sheet-table tbody td,.mini-table td) {
        background: transparent !important;
        color: var(--text-primary) !important;
        border-color: var(--border) !important;
      }
      [data-color-scheme] tbody tr:hover td {
        background: rgba(59, 130, 246, 0.1) !important;
        box-shadow: inset 3px 0 0 var(--primary) !important;
      }
      [data-color-scheme] :is(.workspace-kicker,.kicker,.eyebrow,a:not(.btn):not(.sidebar-link):not(.home-link)) {
        color: var(--link) !important;
      }
      [data-color-scheme] :is(.btn-primary,.btn-accent,button.blue,button.primary,.home-link:not(.ghost),.badge.bg-primary) {
        background: var(--primary) !important;
        border-color: var(--primary) !important;
        color: var(--primary-text) !important;
        box-shadow: none !important;
      }
      [data-color-scheme] :is(.btn-primary,.btn-accent,button.blue,button.primary,.home-link:not(.ghost),.badge.bg-primary):hover {
        background: var(--primary-hover) !important;
        border-color: var(--primary-hover) !important;
        color: var(--primary-hover-text) !important;
      }
      [data-color-scheme] :is(.btn-outline-primary,.btn-outline-secondary,.btn-outline-light,button.secondary,.home-link.ghost,.sidebar-link,.chip,.pill,.quick-chip-row button,.preset-row button,.filter-pill,.sort-button) {
        background: #111827 !important;
        border-color: var(--border) !important;
        color: var(--text-primary) !important;
        box-shadow: none !important;
      }
      [data-color-scheme] :is(.sidebar-link:hover,.sidebar-link.active,.quick-chip-row button.active,.preset-row button.active,.filter-pill.active,.chip.active) {
        background: var(--nav-active) !important;
        border-color: var(--primary) !important;
        color: var(--nav-active-text) !important;
        box-shadow: inset 3px 0 0 var(--primary) !important;
      }
      [data-color-scheme] :is(input,select,textarea,.form-control,.form-select,button,.btn,a):focus-visible {
        outline: none !important;
        box-shadow: 0 0 0 4px var(--focus-ring) !important;
      }
      [data-color-scheme] :is(.brand-mark,.brand .mark,.dashboard-brand img,.owner-brand img,.brand-icon.brand-logo) {
        box-shadow: 0 12px 28px var(--logo-glow) !important;
      }
    `;
  }

  function keepThemeStyleLast() {
    const style = document.getElementById(THEME_STYLE_ID);
    if (style && style.parentNode === document.head) document.head.appendChild(style);
  }

  function setScheme() {
    applySlateDark();
    window.dispatchEvent(new CustomEvent("mtl-theme-change", { detail: { scheme: FIXED_SCHEME, displayMode: FIXED_MODE } }));
  }

  function setDisplayMode() {
    setScheme();
  }

  window.MyTruckingLeadsTheme = {
    schemes,
    getScheme: () => FIXED_SCHEME,
    setScheme,
    applyScheme: applySlateDark,
    getDisplayMode: () => FIXED_MODE,
    setDisplayMode,
    getResolvedDisplayMode: () => FIXED_MODE
  };

  installFixedThemeStyles();
  applySlateDark();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", keepThemeStyleLast, { once: true });
  } else {
    keepThemeStyleLast();
  }
  window.addEventListener("load", keepThemeStyleLast, { once: true });
})();
