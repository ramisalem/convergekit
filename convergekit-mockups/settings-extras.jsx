// settings-extras.jsx — AI provider, Groups (table + drawer), Access policy

const AIProviderScreen = ({ density }) => (
  <Shell active="settings" admin={true} density={density} screenLabel="05 Settings · AI provider">
    <div style={{ background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 22px 6px" }}>
        <a className="jw-back"><Icon name="chevronLeft" size={12} /> Back</a>
        <h1 style={{ margin: "10px 0 4px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Settings</h1>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Configure providers, manage people, and review access policy.</p>
      </div>
      <div className="jw-tabs" style={{ maxWidth: 1100, margin: "16px auto 0", padding: "0 22px" }}>
        <button className="jw-tab is-active">AI provider</button>
        <button className="jw-tab">Users</button>
        <button className="jw-tab">Groups</button>
        <button className="jw-tab">Access policy</button>
      </div>
    </div>
    <div style={{ background: "var(--bg-2)", padding: "20px 22px 40px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="jw-card">
          <div className="jw-card__hd">
            <div>
              <div className="jw-card__title">Provider</div>
              <div className="jw-card__sub">Embeddings, chat, and wiki generation use the selected provider unless individually overridden.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="jw-btn"><Icon name="play" size={11} /> Test connection</button>
              <button className="jw-btn jw-btn--primary">Save changes</button>
            </div>
          </div>
          <div className="jw-card__body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              {[
                { id: "lm", name: "LM Studio", sub: "Local · no key", icon: "flask" },
                { id: "or", name: "OpenRouter", sub: "Multi-provider gateway", icon: "layers" },
                { id: "an", name: "Anthropic", sub: "Claude family", icon: "sparkles", active: true },
                { id: "oa", name: "OpenAI", sub: "GPT + embeddings", icon: "spark" },
              ].map((p) => (
                <div key={p.id} style={{
                  border: p.active ? "2px solid var(--ink)" : "1px solid var(--line)",
                  borderRadius: 10, padding: 14, background: "var(--bg)",
                  position: "relative",
                }}>
                  {p.active && <span style={{ position: "absolute", top: 8, right: 8, fontSize: 10, fontWeight: 600, color: "var(--ink)" }}>SELECTED</span>}
                  <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--bg-3)", display: "grid", placeItems: "center", color: "var(--ink-2)", marginBottom: 8 }}><Icon name={p.icon} size={14} /></span>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 2 }}>{p.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="jw-card">
          <div className="jw-card__hd">
            <div>
              <div className="jw-card__title">Anthropic</div>
              <div className="jw-card__sub">API key is stored encrypted. Replace the key to rotate.</div>
            </div>
          </div>
          <div className="jw-card__body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", display: "block", marginBottom: 5 }}>API key</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input className="jw-input" defaultValue="sk-ant-•••••••••••••••••••••f23c" />
                <button className="jw-btn jw-btn--sm">Replace</button>
                <button className="jw-btn jw-btn--sm jw-btn--danger">Clear</button>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 5 }}>Last rotated 18 days ago</div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", display: "block", marginBottom: 5 }}>Custom endpoint</label>
              <input className="jw-input" placeholder="Optional · default api.anthropic.com" />
            </div>
          </div>
        </div>

        <div className="jw-card">
          <div className="jw-card__hd">
            <div>
              <div className="jw-card__title">Models</div>
              <div className="jw-card__sub">Choose the model used for each role. Embeddings are critical — changing them invalidates existing indexes.</div>
            </div>
            <button className="jw-btn jw-btn--sm"><Icon name="refresh" size={11} /> Refresh list</button>
          </div>
          <div className="jw-card__body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { role: "Embedding model", val: "text-embedding-3-large", note: "1536 dim · 4 repos already indexed", warn: true },
              { role: "Chat model", val: "claude-sonnet-4-5", note: "200k context · streaming" },
              { role: "Wiki & mind map", val: "claude-opus-4-1", note: "Best for long synthesis" },
            ].map((m) => (
              <div key={m.role} style={{ display: "grid", gridTemplateColumns: "180px 1fr 220px", gap: 14, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line-2)" }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.role}</div>
                <select className="jw-select" defaultValue={m.val}><option>{m.val}</option></select>
                <div style={{ fontSize: 11.5, color: m.warn ? "var(--align-stale-fg)" : "var(--ink-4)", display: "flex", alignItems: "center", gap: 5 }}>
                  {m.warn && <Icon name="alert" size={11} />}
                  {m.note}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="jw-card" style={{ borderColor: "#a7f3d0", background: "#ecfdf5" }}>
          <div className="jw-card__body" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, background: "#fff", color: "#047857", display: "grid", placeItems: "center" }}><Icon name="check" size={14} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#065f46" }}>Connection test passed</div>
              <div style={{ fontSize: 12, color: "#047857" }}>Embeddings 142ms · chat 218ms · wiki 198ms</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Shell>
);

const GROUPS = [
  { name: "Engineering · platform", desc: "Owns indexer, wiki, repo guide", members: 14, repos: 6, created: "Jan 12, 2026" },
  { name: "Engineering · payroll", desc: "Owns ledger and payment flows", members: 9, repos: 4, created: "Jan 12, 2026", active: true },
  { name: "Mobile", desc: "iOS and Android apps", members: 6, repos: 2, created: "Feb 4, 2026" },
  { name: "Data", desc: "ETL, warehouse, analytics", members: 4, repos: 3, created: "Feb 21, 2026" },
  { name: "Security", desc: "Read access for audits", members: 3, repos: 12, created: "Mar 8, 2026" },
];

const GroupsScreen = ({ density }) => (
  <Shell active="settings" admin={true} density={density} screenLabel="05 Settings · Groups">
    <div style={{ background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 22px 6px" }}>
        <a className="jw-back"><Icon name="chevronLeft" size={12} /> Back</a>
        <h1 style={{ margin: "10px 0 4px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Settings</h1>
      </div>
      <div className="jw-tabs" style={{ maxWidth: 1100, margin: "16px auto 0", padding: "0 22px" }}>
        <button className="jw-tab">AI provider</button>
        <button className="jw-tab">Users</button>
        <button className="jw-tab is-active">Groups</button>
        <button className="jw-tab">Access policy</button>
      </div>
    </div>
    <div style={{ background: "var(--bg-2)", padding: "20px 22px 40px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}>
        <div className="jw-card">
          <div className="jw-card__hd">
            <div>
              <div className="jw-card__title">Groups · {GROUPS.length}</div>
              <div className="jw-card__sub">Repository access is granted by group. A user with no group sees no repositories.</div>
            </div>
            <button className="jw-btn jw-btn--primary"><Icon name="plus" /> New group</button>
          </div>
          <table className="jw-table">
            <thead>
              <tr><th>Name</th><th>Members</th><th>Repositories</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <tr key={g.name} style={{ background: g.active ? "var(--bg-3)" : "transparent" }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-4)" }}>{g.desc}</div>
                  </td>
                  <td><span style={{ fontWeight: 500 }}>{g.members}</span> <span className="muted">people</span></td>
                  <td><span style={{ fontWeight: 500 }}>{g.repos}</span> <span className="muted">repos</span></td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{g.created}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="jw-btn jw-btn--sm jw-btn--ghost">Open</button>
                    <button className="jw-btn jw-btn--sm jw-btn--ghost">···</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Drawer overlay */}
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 460, background: "var(--bg)", borderLeft: "1px solid var(--line)", boxShadow: "var(--shadow-pop)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Engineering · payroll</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>Owns ledger and payment flows</div>
            </div>
            <button className="jw-icon-btn" style={{ width: 26, height: 26 }}><Icon name="slash" size={12} /></button>
          </div>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-2)", display: "flex", gap: 8 }}>
            <button className="jw-btn jw-btn--sm"><Icon name="users" size={11} /> Add members</button>
            <button className="jw-btn jw-btn--sm"><Icon name="git" size={11} /> Assign repos</button>
            <button className="jw-btn jw-btn--sm jw-btn--ghost" style={{ marginLeft: "auto" }}>Edit</button>
          </div>
          <div className="jw-scroll" style={{ flex: 1, padding: "12px 20px" }}>
            <div className="label-eyebrow" style={{ marginBottom: 8 }}>Members · 9</div>
            {[
              { n: "Reza Almeida", e: "reza@example.com", i: "RA" },
              { n: "Mariam Khoury", e: "mariam@example.com", i: "MK" },
              { n: "Tomás Vidal", e: "tomas@example.com", i: "TV", pending: true },
            ].map((m) => (
              <div key={m.e} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line-2)" }}>
                <span className="jw-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{m.i}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{m.n}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{m.e}</div>
                </div>
                {m.pending && <span className="jw-chip is-processing" style={{ fontSize: 10.5 }}>pending</span>}
                <button className="jw-btn jw-btn--sm jw-btn--ghost">Remove</button>
              </div>
            ))}
            <div className="label-eyebrow" style={{ marginBottom: 8, marginTop: 18 }}>Repositories · 4</div>
            {[
              { n: "example-org/payroll-ledger", st: "processing" },
              { n: "example-org/payroll-flows", st: "done" },
              { n: "example-org/payroll-fixtures", st: "done" },
              { n: "example-org/billing-shared", st: "done" },
            ].map((r) => (
              <div key={r.n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line-2)" }}>
                <Icon name="git" size={14} style={{ color: "var(--ink-4)" }} />
                <span className="mono" style={{ fontSize: 12.5, flex: 1 }}>{r.n}</span>
                <StatusChip status={r.st} />
                <button className="jw-btn jw-btn--sm jw-btn--ghost">Unassign</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </Shell>
);

const PolicyScreen = ({ density }) => (
  <Shell active="settings" admin={true} density={density} screenLabel="05 Settings · Access policy">
    <div style={{ background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 22px 6px" }}>
        <a className="jw-back"><Icon name="chevronLeft" size={12} /> Back</a>
        <h1 style={{ margin: "10px 0 4px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Settings</h1>
      </div>
      <div className="jw-tabs" style={{ maxWidth: 1100, margin: "16px auto 0", padding: "0 22px" }}>
        <button className="jw-tab">AI provider</button>
        <button className="jw-tab">Users</button>
        <button className="jw-tab">Groups</button>
        <button className="jw-tab is-active">Access policy</button>
      </div>
    </div>
    <div style={{ background: "var(--bg-2)", padding: "20px 22px 40px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="jw-card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-2)" }}>
          <span style={{ color: "var(--ink-3)" }}><Icon name="shield" size={15} /></span>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            These values are configured at deploy time and read-only here. Change them by updating environment variables and redeploying.
          </div>
        </div>
        <div className="jw-card">
          <div className="jw-card__body" style={{ padding: 0 }}>
            {[
              { key: "Allowed email domain", val: "example.com", env: "AUTH_EMAIL_DOMAIN", desc: "Standard users can sign in only with this domain." },
              { key: "Allowed GitHub organization", val: "example-engineering", env: "AUTH_GITHUB_ORG", desc: "Admins must be members of this GitHub org." },
              { key: "Allowed repository host", val: "github.com", env: "REPO_ALLOWED_HOST", desc: "Repositories can be added only from this host." },
            ].map((p, i, arr) => (
              <div key={p.env} style={{ padding: "16px 20px", borderBottom: i < arr.length - 1 ? "1px solid var(--line-2)" : "0", display: "grid", gridTemplateColumns: "1fr 240px", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.key}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>{p.desc}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 6 }}>${p.env}</div>
                </div>
                <div className="mono" style={{
                  fontSize: 13, padding: "8px 12px", background: "var(--bg-2)",
                  border: "1px solid var(--line)", borderRadius: 6, textAlign: "left",
                  color: "var(--ink)",
                }}>{p.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </Shell>
);

window.AIProviderScreen = AIProviderScreen;
window.GroupsScreen = GroupsScreen;
window.PolicyScreen = PolicyScreen;
