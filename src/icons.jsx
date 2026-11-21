// ─── NAV ICONS ────────────────────────────────────────────────────────────────
// Line icons for the sidebar and the phone nav (2026-11-21 visual refresh).
// They replace the emoji icons, which rendered differently on every phone and
// laptop and fought with the text. 24×24 grid, stroke only, so they take the
// nav item's colour (currentColor). Drawn for FabHub; no icon library added.
import React from "react";

const ICON_PATHS = {
  home:      "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  calendar:  "M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 10h18M8 3v4M16 3v4",
  chart:     "M4 20V10M10 20V4M16 20v-7M22 20H2",
  trend:     "M3 17l6-6 4 4 8-8M15 7h6v6",
  clipboard: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 12h6M9 16h4",
  pen:       "M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16zM14 6l3 3",
  box:       "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9",
  archive:   "M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4",
  target:    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  bank:      "M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18",
  send:      "M21 3 10 14M21 3l-7 18-4-7-7-4z",
  book:      "M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 21a2 2 0 0 1 2-2h14v2",
  gear:      "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  database:  "M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  receipt:   "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  cart:      "M3 4h2l2.5 11h11L21 7H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  truck:     "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  wrench:    "M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3l9.4-9.4a4 4 0 0 0-5-5l2.6 2.6-.6 2.4-2.4.6z",
  hammer:    "M14 4l6 6-2 2-6-6zM12 6 3 15l3 3 9-9",
  users:     "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6",
  building:  "M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M16 9h3a1 1 0 0 1 1 1v11M2 21h20M8 7h4M8 11h4M8 15h4",
  search:    "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  calc:      "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01",
  ruler:     "M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2",
  folder:    "M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  check:     "M4 12l5 5L20 6",
  alert:     "M12 3 2 20h20zM12 10v4M12 17h.01",
  refresh:   "M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4",
  wallet:    "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01",
  tv:        "M3 5h18v12H3zM8 21h8M12 17v4",
  bot:       "M5 9h14v10H5zM12 5v4M9 13h.01M15 13h.01M9 16h6M12 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  pulse:     "M3 12h4l3-7 4 14 3-7h4",
  trophy:    "M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a4 4 0 0 0 4 4M16 6h4a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6",
  layers:    "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17l10 5 10-5",
  file:      "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6",
  coins:     "M9 10c3.3 0 6-1.1 6-2.5S12.3 5 9 5 3 6.1 3 7.5 5.7 10 9 10zM3 7.5v4C3 12.9 5.7 14 9 14s6-1.1 6-2.5M15 11.5c3.3 0 6 1.1 6 2.5v4c0 1.4-2.7 2.5-6 2.5s-6-1.1-6-2.5v-4",
  signal:    "M4 20v-4M9 20v-8M14 20V8M19 20V4",
  swap:      "M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  cash:      "M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01",
  logout:    "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3",
  help:      "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01",
  save:      "M5 3h11l3 3v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 3v5h7V3M8 21v-7h8v7",
  menu:      "M4 6h16M4 12h16M4 18h16",
  chevL:     "M15 18l-6-6 6-6",
  chevR:     "M9 18l6-6-6-6",
  star:      "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  dot:       "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
};

// Nav item / hub id → icon. Anything unlisted falls back to a dot.
export const NAV_ICON_OF = {
  home:"home", calendar:"calendar", financecal:"calendar",
  pipeline:"chart", sales:"chart", "sales-reports":"trend", reports:"trend", "finance-reports":"trend", acctreport:"chart",
  boq:"calc", ceqs:"ruler", costanalysis:"coins", projectmargins:"coins", clients:"building",
  projects:"clipboard", progress:"signal", subconcert:"hammer", subconmon:"hammer", subconwo:"hammer", addenda:"alert", pmupdates:"file", pmfeed:"clipboard", checklist:"check", joborders:"file",
  design:"pen", designboard:"pen", drf:"pen", designstatus:"pen", swatchboard:"layers", myfolder:"folder",
  orders:"box", orderboard:"clipboard", purchasing:"cart", procurement:"box", purchaseorders:"box", materialreq:"wrench", requests:"clipboard", budgetreq:"wallet",
  warehouse:"archive", inventory:"archive", deliveries:"truck", stockmove:"swap",
  masters:"database", suppliers:"database", subcontractors:"users",
  executive:"target", exectxns:"swap", execpl:"trend", execloans:"wallet", monitoring:"pulse", monboard:"pulse",
  money:"bank", cash:"bank", cashposition:"bank", cashflow:"trend", billing:"receipt", collections:"cash",
  payables:"send", supplierbills:"receipt", payrun:"cash", payments:"cash", liquidations:"receipt", checkvouchers:"check", evouchers:"receipt",
  accounting:"book", finance:"book", acctdash:"book", expmon:"receipt", bir2307:"file", coa:"book", dailylog:"book",
  admin:"gear", accounts:"users", audit:"search", syshealth:"pulse", botsettings:"bot", tvboard:"tv", activity:"trophy",
  datamanagement:"database", ops:"gear", more:"menu",
};

// Quoted keys: scripts/check-imports.js matches bare words, and a bare `fill`
// attribute reads to it like the `fill` helper in views/boqExcel.js.
const SVG_BASE = { "fill": "none", "stroke": "currentColor" };

export function Icon({ name, size = 18, stroke = 1.8, style, title }) {
  const d = ICON_PATHS[name] || ICON_PATHS.dot;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...SVG_BASE}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined}
      style={{ flexShrink: 0, display: "block", ...(style || {}) }}>
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  );
}

export const NavIcon = ({ id, hub, size }) => <Icon name={NAV_ICON_OF[hub] || NAV_ICON_OF[id] || "dot"} size={size} />;

export default Icon;
