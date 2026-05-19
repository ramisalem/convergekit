// settings-tab.jsx — Repository Advanced Settings (MCP tokens + admin maintenance)

const SettingsTab = () => {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 22px 40px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Token reveal banner — one-time secret */}
      <div className="jw-card" style={{ borderColor: "#fde68a", background: "linear-gradient(180deg, #fffbeb 0%, #fff 100%)" }}>
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "#fef3c7", color: "#92400e", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
            <Icon name="lock" size={15} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Token created — copy it now</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>
              This token is shown <b>once</b>. We've stored its fingerprint, not the value.
            </div>
            <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
              <span className="mono" style={{ fontSize: 12.5, color: "var(--ink)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                convergekit_live_4f8a91c8b7c4a2e0d3f5b1e9c0d2a8f1...
              </span>
              <button className="jw-btn jw-btn--sm"><Icon name="copy" size={12} /> Copy token</button>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "center" }}>
              <label style={{ fontSize: 12, color: "var(--ink-3)" }}>Setup for</label>
              <div style={{ display: "inline-flex", padding: 3, gap: 2, background: "var(--bg-3)", borderRadius: 8 }}>
                {["Claude Desktop", "Cursor", "Generic JSON"].map((c, i) => (
                  <button key={c} className="jw-btn jw-btn--sm" style={{
                    height: 24, padding: "0 9px", fontSize: 11.5,
                    background: i === 0 ? "var(--bg)" : "transparent",
                    borderColor: i === 0 ? "var(--line)" : "transparent",
                  }}>{c}</button>
                ))}
              </div>
              <button className="jw-btn jw-btn--sm" style={{ marginLeft: "auto" }}><Icon name="copy" size={12} /> Copy config</button>
              <button className="jw-btn jw-btn--sm"><Icon name="play" size={11} /> Test connection</button>
            </div>
          </div>
          <button className="jw-icon-btn" style={{ width: 26, height: 26, border: 0, background: "transparent" }} title="Dismiss">
            <Icon name="slash" size={13} />
          </button>
        </div>
      </div>

      {/* Tokens */}
      <div className="jw-card">
        <div className="jw-card__hd">
          <div>
            <div className="jw-card__title">MCP tokens</div>
            <div className="jw-card__sub">Issue scoped tokens for Claude Desktop, Cursor, or other MCP clients.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select className="jw-select" style={{ width: 180 }} defaultValue="all">
              <option value="all">All owners</option>
              <option>You</option>
              <option>Members</option>
            </select>
            <button className="jw-btn jw-btn--primary"><Icon name="plus" /> New token</button>
          </div>
        </div>
        <div style={{ padding: "0 0 4px" }}>
          <table className="jw-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Owner</th>
                <th>Scopes</th>
                <th>Last used</th>
                <th>Health</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Claude Desktop · Aamir", owner: "you", scopes: ["repo:read","docs:search","files:read"], used: "12 min ago", health: "ok", expires: "in 28 days" },
                { label: "Cursor · MacBook Pro", owner: "you", scopes: ["repo:read","docs:search"], used: "yesterday", health: "ok", expires: "in 84 days" },
                { label: "Reza Almeida", owner: "Reza A.", scopes: ["repo:read","docs:search","files:read"], used: "3h ago", health: "stale", expires: "in 5 days" },
                { label: "CI bot · ephemeral", owner: "Mariam K.", scopes: ["repo:read"], used: "Apr 12", health: "alert", expires: "expired" },
              ].map((t, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 500, color: "var(--ink)" }}>{t.label}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>fp:8a4c…91d2</div>
                  </td>
                  <td style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{t.owner}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {t.scopes.map((s) => <span key={s} className="jw-chip" style={{ background: "var(--bg-3)", color: "var(--ink-2)", border: "1px solid var(--line)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{s}</span>)}
                    </div>
                  </td>
                  <td style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t.used}</td>
                  <td>
                    {t.health === "ok" && <span className="jw-chip align-ok">Healthy</span>}
                    {t.health === "stale" && <span className="jw-chip align-stale">Aging</span>}
                    {t.health === "alert" && <span className="jw-chip align-conflict">Suspicious use</span>}
                  </td>
                  <td style={{ fontSize: 12.5, color: t.expires === "expired" ? "var(--align-conflict-fg)" : "var(--ink-3)" }}>
                    {t.expires}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="jw-btn jw-btn--sm jw-btn--ghost">Setup</button>
                    <button className="jw-btn jw-btn--sm jw-btn--ghost">Audit</button>
                    <button className="jw-btn jw-btn--sm jw-btn--ghost" disabled={t.owner !== "you"} style={{ opacity: t.owner !== "you" ? 0.4 : 1 }}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maintenance — admin only */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="jw-card">
          <div className="jw-card__hd">
            <div>
              <div className="jw-card__title">Re-index repository</div>
              <div className="jw-card__sub">Re-clone, parse, and embed everything from scratch.</div>
            </div>
          </div>
          <div className="jw-card__body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Last full index: 2 hours ago · 6m 14s</div>
            <button className="jw-btn"><Icon name="refresh" size={12} /> Re-index</button>
          </div>
        </div>
        <div className="jw-card">
          <div className="jw-card__hd">
            <div>
              <div className="jw-card__title">Regenerate Wiki</div>
              <div className="jw-card__sub">Skip indexing; rebuild pages from current chunks.</div>
            </div>
          </div>
          <div className="jw-card__body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "var(--ink-4)" }}>47 pages · 1m 48s typical</div>
            <button className="jw-btn"><Icon name="sparkles" size={12} /> Regenerate</button>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="jw-card" style={{ borderColor: "#fecaca" }}>
        <div className="jw-card__hd">
          <div>
            <div className="jw-card__title" style={{ color: "#b91c1c" }}>Danger zone</div>
            <div className="jw-card__sub">Deleting a repository removes all indexed data, wiki pages, chats, and tokens.</div>
          </div>
          <button className="jw-btn jw-btn--danger">Delete repository</button>
        </div>
      </div>
    </div>
  );
};

window.SettingsTab = SettingsTab;
