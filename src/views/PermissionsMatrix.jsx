import React from "react";
import { PERMISSIONS, PERM_ROLES, PERM_NOTES, PERM_ACTIONS, roleCan, ROLE_CLR, roleLabel } from "../core";

// ─── PERMISSIONS MATRIX ───────────────────────────────────────────────────────
// A read-only, manager-facing view of who can do what. It renders straight from
// the PERMISSIONS map in core.js, which mirrors the Supabase RLS write policies —
// so this page and the actual server rules can never silently drift: change the
// map and both the pre-write dialogs and this table move together.
//
// This is a REFERENCE, not a control panel — you cannot change access here (that
// lives in the SQL RLS migrations). It answers "why couldn't my staffer save X?"

const ACTION_META = {
  select: { label: "View",   icon: "👁", tip: "See the records" },
  insert: { label: "Create", icon: "➕", tip: "Add a new record" },
  update: { label: "Edit",   icon: "✏️", tip: "Change an existing record" },
  delete: { label: "Delete", icon: "🗑", tip: "Remove a record" },
};

const Cell = ({ ok }) => (
  <td style={{ textAlign: "center", padding: "7px 4px", borderBottom: "1px solid #f1f5f9",
    background: ok ? "#f0fdf4" : "#fff" }}>
    <span style={{ fontSize: ".9rem", color: ok ? "#16a34a" : "#e2e8f0", fontWeight: 800 }}>
      {ok ? "✓" : "·"}
    </span>
  </td>
);

export default function PermissionsMatrix({ Wrap, isMobile }) {
  const [action, setAction] = React.useState("update");
  const [filter, setFilter] = React.useState("");

  const rows = Object.entries(PERMISSIONS)
    .filter(([, t]) => !filter || t.label.toLowerCase().includes(filter.toLowerCase()) || (t.group || "").toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => (a[1].group || "").localeCompare(b[1].group || "") || a[1].label.localeCompare(b[1].label));

  // Group rows by their group label so the table reads section-by-section.
  const groups = [];
  rows.forEach(([table, t]) => {
    const g = groups.find(x => x.name === (t.group || "Other"));
    if (g) g.rows.push([table, t]);
    else groups.push({ name: t.group || "Other", rows: [[table, t]] });
  });

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: isMobile ? "14px 10px" : "20px" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: "1.6rem", color: "#0f172a", margin: 0, letterSpacing: .3 }}>
          🔐 Permissions
        </h1>
        <p style={{ fontSize: ".85rem", color: "#64748b", margin: "4px 0 0", lineHeight: 1.5 }}>
          Who on the team can do what. This mirrors the database security rules exactly — if a staffer
          says "it won't save," find the row and column here to see whether their role is allowed. Access
          is set in the backend (RLS), not on this page.
        </p>
      </div>

      {/* Action selector */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {PERM_ACTIONS.map(a => (
          <button key={a} onClick={() => setAction(a)}
            style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${action === a ? "#f97316" : "#e2e8f0"}`,
              background: action === a ? "#fff7ed" : "#fff", color: action === a ? "#c2410c" : "#64748b",
              fontFamily: "inherit", fontSize: ".78rem", fontWeight: action === a ? 700 : 500, cursor: "pointer" }}>
            {ACTION_META[a].icon} {ACTION_META[a].label}
          </button>
        ))}
      </div>

      <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by area or table…"
        style={{ width: "100%", maxWidth: 320, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 11px",
          fontFamily: "inherit", fontSize: ".82rem", marginBottom: 14, boxSizing: "border-box" }} />

      <div style={{ fontSize: ".76rem", color: "#64748b", marginBottom: 8 }}>
        Showing who can <strong style={{ color: "#c2410c" }}>{ACTION_META[action].label.toLowerCase()}</strong> ({ACTION_META[action].tip.toLowerCase()}) each record type.
      </div>

      <div style={{ overflowX: "auto", border: "1.5px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ textAlign: "left", padding: "9px 12px", fontSize: ".72rem", fontWeight: 800, color: "#475569",
                textTransform: "uppercase", letterSpacing: ".4px", position: "sticky", left: 0, background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                Record type
              </th>
              {PERM_ROLES.map(r => (
                <th key={r} title={roleLabel(r)} style={{ padding: "9px 4px", fontSize: ".62rem", fontWeight: 700, color: "#fff",
                  borderBottom: "2px solid #e2e8f0", background: ROLE_CLR[r] || "#64748b", whiteSpace: "nowrap" }}>
                  <div style={{ writingMode: isMobile ? "vertical-rl" : "horizontal-tb", transform: isMobile ? "rotate(180deg)" : "none", padding: "0 3px" }}>
                    {roleLabel(r)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <React.Fragment key={g.name}>
                <tr>
                  <td colSpan={PERM_ROLES.length + 1} style={{ padding: "6px 12px", fontSize: ".68rem", fontWeight: 800,
                    color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".5px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {g.name}
                  </td>
                </tr>
                {g.rows.map(([table, t]) => (
                  <tr key={table}>
                    <td style={{ padding: "7px 12px", fontSize: ".8rem", fontWeight: 600, color: "#0f172a",
                      borderBottom: "1px solid #f1f5f9", position: "sticky", left: 0, background: "#fff", whiteSpace: "nowrap" }}>
                      {t.label}
                      {PERM_NOTES[table] && <span title={PERM_NOTES[table]} style={{ marginLeft: 5, cursor: "help", color: "#f59e0b" }}>⚠</span>}
                    </td>
                    {PERM_ROLES.map(r => <Cell key={r} ok={roleCan(r, action, table)} />)}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Caveats */}
      {Object.keys(PERM_NOTES).some(tbl => rows.find(([t]) => t === tbl)) && (
        <div style={{ marginTop: 14, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: ".74rem", fontWeight: 800, color: "#b45309", marginBottom: 6 }}>⚠ Special rules</div>
          {Object.entries(PERM_NOTES).filter(([tbl]) => rows.find(([t]) => t === tbl)).map(([tbl, note]) => (
            <div key={tbl} style={{ fontSize: ".76rem", color: "#92400e", lineHeight: 1.5, marginBottom: 3 }}>
              <strong>{PERMISSIONS[tbl].label}:</strong> {note}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: ".72rem", color: "#94a3b8", lineHeight: 1.55 }}>
        Three role names are treated as an existing role by the system: <strong>Operations</strong> = Project Mover,
        <strong> Cost Control</strong> = Finance, <strong>Admin</strong> = Manager. Roles <strong>Audit</strong> and
        <strong> HR &amp; Admin</strong> currently have no write access to any record type.
      </div>
    </div>
  );
}
