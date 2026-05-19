// settings-global.jsx — Global admin Settings: Users tab + tab nav

const SettingsGlobalScreen = ({ density, onBack }) => {
  const [tab, setTab] = React.useState("users");
  return (
    <Shell active="settings" admin={true} density={density} screenLabel="05 Settings · Users">
      <div style={{ background: "var(--bg)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 22px 6px" }}>
          <a className="jw-back" onClick={onBack}><Icon name="chevronLeft" size={12} /> Back</a>
          <h1 style={{ margin: "10px 0 4px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Settings</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Configure providers, manage people, and review access policy.</p>
        </div>
        <div className="jw-tabs" style={{ maxWidth: 1100, margin: "16px auto 0", padding: "0 22px" }}>
          {[
            ["ai", "AI provider"],
            ["users", "Users"],
            ["groups", "Groups"],
            ["policy", "Access policy"],
          ].map(([k, label]) => (
            <button key={k} className={`jw-tab ${tab === k ? "is-active" : ""}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ background: "var(--bg-2)", minHeight: "calc(100% - 178px)", padding: "20px 22px 40px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {tab === "users" && <UsersPanel />}
          {tab === "ai" && <AIProviderPanel />}
          {tab === "groups" && <GroupsPanel />}
          {tab === "policy" && <PolicyPanel />}
        </div>
      </div>
    </Shell>
  );
};

const USERS = [
  { name: "Aamir Saleh", email: "aamir@example.com", role: "admin", group: "Engineering · platform", status: "active", initials: "AS", self: true },
  { name: "Reza Almeida", email: "reza@example.com", role: "user", group: "Engineering · payroll", status: "active", initials: "RA" },
  { name: "Mariam Khoury", email: "mariam@example.com", role: "user", group: "Engineering · platform", status: "active", initials: "MK" },
  { name: "Tomás Vidal", email: "tomas@example.com", role: "user", group: "Data", status: "pending", initials: "TV" },
  { name: "Lia Park", email: "lia@example.com", role: "admin", group: "Platform", status: "active", initials: "LP" },
  { name: "Ben Osei", email: "ben@example.com", role: "user", group: "Mobile", status: "deactivated", initials: "BO" },
];

const UsersPanel = () => {
  const [selected, setSelected] = React.useState(new Set());
  const allSelected = selected.size === USERS.length;
  const toggle = (e) => {
    const next = new Set(selected);
    if (next.has(e)) next.delete(e); else next.add(e);
    setSelected(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="jw-card">
        <div className="jw-card__hd">
          <div>
            <div className="jw-card__title">People · {USERS.length}</div>
            <div className="jw-card__sub">Standard users sign in by email; admins via GitHub OAuth.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="jw-search" style={{ width: 240 }}>
              <Icon name="search" />
              <input className="jw-input" placeholder="Search people" />
            </div>
            <button className="jw-btn jw-btn--primary"><Icon name="plus" /> Invite user</button>
          </div>
        </div>
        {selected.size > 0 && (
          <div style={{ padding: "10px 20px", background: "#0e1116", color: "#fff", display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>{selected.size} selected</span>
            <span style={{ height: 16, width: 1, background: "rgba(255,255,255,.2)" }} />
            <button className="jw-btn jw-btn--sm" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.2)" }}>Assign group</button>
            <button className="jw-btn jw-btn--sm" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.2)" }}>Change role</button>
            <button className="jw-btn jw-btn--sm" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.2)" }}>Revoke MCP</button>
            <button className="jw-btn jw-btn--sm" style={{ background: "transparent", color: "#fca5a5", borderColor: "rgba(255,255,255,.2)" }}>Deactivate</button>
            <button className="jw-icon-btn" style={{ marginLeft: "auto", border: 0, background: "transparent", color: "#fff" }} onClick={() => setSelected(new Set())}><Icon name="slash" size={13} /></button>
          </div>
        )}
        <table className="jw-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(USERS.map(u => u.email)))} />
              </th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Group</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {USERS.map((u) => (
              <tr key={u.email}>
                <td><input type="checkbox" checked={selected.has(u.email)} onChange={() => toggle(u.email)} /></td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="jw-avatar" style={{ width: 26, height: 26, fontSize: 10 }}>{u.initials}</span>
                    <div>
                      <div style={{ fontWeight: 500 }}>{u.name}{u.self && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--ink-4)" }}>(you)</span>}</div>
                    </div>
                  </div>
                </td>
                <td className="mono" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{u.email}</td>
                <td>
                  <span className={`jw-chip ${u.role === "admin" ? "auth-D" : ""}`} style={u.role !== "admin" ? { background: "var(--bg-3)", color: "var(--ink-2)", border: "1px solid var(--line)" } : {}}>
                    {u.role === "admin" ? "Admin" : "User"}
                  </span>
                </td>
                <td style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{u.group}</td>
                <td>
                  {u.status === "active" && <span className="jw-chip align-ok">Active</span>}
                  {u.status === "pending" && <span className="jw-chip is-processing">Pending invite</span>}
                  {u.status === "deactivated" && <span className="jw-chip is-failed">Deactivated</span>}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button className="jw-btn jw-btn--sm jw-btn--ghost" disabled={u.self} title={u.self ? "You can't modify your own account" : ""} style={{ opacity: u.self ? 0.4 : 1 }}>···</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reveal dialog mock */}
      <div className="jw-card" style={{ borderColor: "#bfdbfe", background: "linear-gradient(180deg, #eff6ff 0%, #fff 100%)" }}>
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "#dbeafe", color: "#1d4ed8", display: "grid", placeItems: "center" }}>
            <Icon name="eye" size={15} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Invite URL for Tomás Vidal — copy it now</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>
              We don't store invite URLs. If you lose it, resend the invite to issue a new one.
            </div>
            <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
              <span className="mono" style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}>
                https://convergekit.example.com/en/auth/accept-invite?token=ey3J4...
              </span>
              <button className="jw-btn jw-btn--sm"><Icon name="copy" size={12} /> Copy URL</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 8 }}>
              Expires in 7 days · single use · invalidated on first password set
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AIProviderPanel = () => (
  <div className="jw-card">
    <div className="jw-card__hd">
      <div>
        <div className="jw-card__title">AI provider</div>
        <div className="jw-card__sub">Choose the provider used for embeddings, chat, and wiki generation.</div>
      </div>
      <button className="jw-btn jw-btn--primary">Save changes</button>
    </div>
    <div className="jw-card__body">
      <div style={{ fontSize: 13, color: "var(--ink-4)" }}>(Form mocked — Users tab is the canonical settings demo.)</div>
    </div>
  </div>
);
const GroupsPanel = () => (
  <div className="jw-card jw-card__hd"><div className="jw-card__title">Groups</div></div>
);
const PolicyPanel = () => (
  <div className="jw-card"><div className="jw-card__hd"><div className="jw-card__title">Access policy</div><div className="jw-card__sub">Read-only · configured at deploy time.</div></div></div>
);

window.SettingsGlobalScreen = SettingsGlobalScreen;
