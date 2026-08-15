// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
// The single source of truth for FabHub's palette. Historically every color was
// an inline hex literal repeated thousands of times across App.jsx and the views,
// so the "same" slate or amber drifted between components and could never be
// themed. New/edited UI should pull from here instead of hardcoding hex.
//
// Names describe ROLE, not hue, so a future re-skin (or dark mode) only touches
// this file. The values below are the canonical versions of the colors already
// in use — adopting T.* is a no-op visually, but centralizes the definition.
export const T = {
  // Brand
  accent:      "#f59e0b", // amber — primary brand accent (active nav, focus ring, CTAs)
  accentSoft:  "rgba(245,158,11,.15)",
  accentInk:   "#b45309", // amber text on light surfaces

  // Ink / text (slate ramp, dark → light)
  ink:         "#0f172a",
  inkStrong:   "#1e293b",
  inkBody:     "#334155",
  inkSoft:     "#475569",
  inkMuted:    "#64748b",
  inkFaint:    "#94a3b8",

  // Surfaces
  surface:     "#ffffff",
  surface2:    "#f8fafc", // app background / readOnly fields
  surface3:    "#f1f5f9", // chips, subtle fills
  navy:        "#1e293b", // sidebar / dark chrome

  // Lines
  line:        "#e2e8f0",
  lineSoft:    "#eef2f7",

  // Semantic (each: base + soft background + border tint)
  success:     "#16a34a", successAlt:"#059669", successBg:"#f0fdf4", successLine:"#6ee7b7",
  danger:      "#dc2626", dangerBg:"#fef2f2", dangerLine:"#fca5a5",
  warning:     "#d97706", warningAlt:"#92400e", warningBg:"#fffbeb", warningLine:"#fde68a",
  info:        "#2563eb", infoAlt:"#1d4ed8", infoBg:"#eff6ff", infoLine:"#93c5fd",

  // Shape scale
  radius:   { sm:6, md:8, lg:12, xl:14, pill:20 },
  shadow:   { card:"0 1px 6px rgba(0,0,0,.05)", cardHover:"0 6px 20px rgba(0,0,0,.1)",
              kpi:"0 1px 4px rgba(0,0,0,.04)", modal:"0 24px 80px rgba(0,0,0,.2)",
              toast:"0 8px 24px rgba(0,0,0,.12)" },
  // Display typeface used for figures / headings
  displayFont: "'Barlow Condensed',sans-serif",
};

export default T;
