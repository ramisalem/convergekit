// dialogs-and-states.jsx — Add Repo dialog, Empty states, Job progress, Wiki empty

const AddRepoDialog = ({ density }) => (
  <Shell active="repos" admin={true} density={density} screenLabel="01 Add repository dialog">
    <div style={{ position: "relative", height: "100%", background: "var(--bg-2)" }}>
      {/* dimmed list behind */}
      <div style={{ filter: "blur(2px)", opacity: 0.6, pointerEvents: "none", height: "100%" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>Repositories</h1>
            <button className="jw-btn jw-btn--primary"><Icon name="plus" /> Add repository</button>
          </div>
          <div className="jw-card" style={{ height: 200 }} />
        </div>
      </div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(15,17,22,.32)", display: "grid", placeItems: "center", padding: 24 }}>
        <div className="jw-card" style={{ width: 560, boxShadow: "var(--shadow-pop)", maxHeight: "calc(100% - 32px)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Add repository</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 1 }}>Pick from your allowed GitHub organization.</div>
            </div>
            <button className="jw-icon-btn" style={{ width: 26, height: 26 }}><Icon name="slash" size={12} /></button>
          </div>
          <div style={{ padding: "14px 22px 4px" }}>
            <div className="jw-search">
              <Icon name="search" />
              <input className="jw-input" placeholder="Search example-engineering" defaultValue="payroll" />
            </div>
          </div>
          <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", maxHeight: 280, overflow: "auto" }}>
            {[
              { name: "example-org/payroll-ledger", desc: "Double-entry ledger service — Rust", priv: true, sel: true },
              { name: "example-org/payroll-flows", desc: "End-of-month payment automation", priv: true },
              { name: "example-org/payroll-fixtures", desc: "Test fixtures and seed data", priv: false },
            ].map((r) => (
              <div key={r.name} style={{
                padding: "10px 10px", borderRadius: 7,
                background: r.sel ? "var(--bg-3)" : "transparent",
                display: "flex", alignItems: "center", gap: 11,
                border: r.sel ? "1px solid var(--line)" : "1px solid transparent",
              }}>
                <span style={{ color: r.priv ? "var(--ink-2)" : "var(--ink-4)" }}>
                  <Icon name={r.priv ? "lock" : "git"} size={13} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{r.desc}</div>
                </div>
                {r.sel && <Icon name="check" size={14} style={{ color: "var(--ink)" }} />}
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 22px", borderTop: "1px solid var(--line-2)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", display: "block", marginBottom: 5 }}>Branch</label>
              <input className="jw-input" defaultValue="main" />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", display: "block", marginBottom: 5 }}>Profile</label>
              <select className="jw-select" defaultValue="default"><option>Default · 1024 chunks</option></select>
            </div>
          </div>
          <div style={{ padding: "10px 22px", borderTop: "1px solid var(--line-2)", display: "flex", gap: 8, alignItems: "center", background: "#fffbeb" }}>
            <span style={{ color: "#b45309" }}><Icon name="alert" size={13} /></span>
            <span style={{ fontSize: 12, color: "#92400e" }}>GitHub access is read-only on private repos. Webhooks will not be installed.</span>
          </div>
          <div style={{ padding: "12px 22px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="jw-btn">Cancel</button>
            <button className="jw-btn jw-btn--primary">Add &amp; index</button>
          </div>
        </div>
      </div>
    </div>
  </Shell>
);

const EmptyAdminScreen = ({ density }) => (
  <Shell active="repos" admin={true} density={density} screenLabel="01 Repositories · empty (admin)">
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>Repositories</h1>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13.5 }}>Connect your first repository to start indexing.</p>
      </div>
      <div className="jw-card" style={{ padding: 56, textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--bg-3)", color: "var(--ink-2)", display: "grid", placeItems: "center", margin: "0 auto 18px" }}>
          <Icon name="git" size={22} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 6px" }}>No repositories yet</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: "0 auto 20px", maxWidth: 420, lineHeight: 1.55 }}>
          Add a repository from your allowed GitHub organization. Indexing usually takes 4–8 minutes per 100k LOC.
        </p>
        <button className="jw-btn jw-btn--primary" style={{ height: 36, padding: "0 16px" }}><Icon name="plus" /> Add repository</button>
        <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--line-2)", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, textAlign: "left" }}>
          {[
            { i: "shield", h: "Scoped by policy", b: "Only repos in your allowed GitHub org appear in the picker." },
            { i: "layers", h: "Three index phases", b: "Repository analysis → mind map → wiki generation." },
            { i: "lock", h: "Tokens, not secrets", b: "MCP tokens are scoped per-repo, expire, and are revealed once." },
          ].map((x) => (
            <div key={x.h}>
              <span style={{ color: "var(--ink-3)" }}><Icon name={x.i} size={14} /></span>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{x.h}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{x.b}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </Shell>
);

const DocsProgressScreen = ({ density }) => (
  <Shell active="repos" admin={true} density={density} screenLabel="03 Docs · job progress">
    <div className="jw-repo-header">
      <a className="jw-back"><Icon name="chevronLeft" size={12} /> Repositories</a>
      <div className="jw-repo-title">
        <span className="jw-repo-row__icon"><Icon name="git" size={16} /></span>
        <h1>example-org/payroll-ledger</h1>
        <span className="jw-chip jw-chip--dot is-processing">Processing</span>
      </div>
      <div className="jw-repo-meta">
        <span className="mono">github.com/example-org/payroll-ledger</span>
        <span className="dot" /><span><span className="kbd">main</span> @ <span className="mono">f24e1a0</span></span>
        <span className="dot" /><span>Started 4m 12s ago</span>
      </div>
    </div>
    <div className="jw-tabs">
      <button className="jw-tab jw-tab--admin is-active">Documentation</button>
      <button className="jw-tab">Repo Guide</button>
      <button className="jw-tab">Chat</button>
      <button className="jw-tab">Advanced Settings</button>
    </div>
    <div style={{ background: "var(--bg-2)", minHeight: "calc(100% - 130px)", padding: "32px 22px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
        <div style={{ width: 84, height: 84, borderRadius: "50%", background: "conic-gradient(var(--ink) 64%, var(--bg-3) 0)", margin: "0 auto 18px", display: "grid", placeItems: "center" }}>
          <div style={{ width: 70, height: 70, borderRadius: "50%", background: "var(--bg)", display: "grid", placeItems: "center", fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>64%</div>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.015em" }}>Generating wiki pages</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: "0 0 28px" }}>
          30 of 47 pages generated · est. 2m 18s remaining · safe to leave this tab.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 0, marginBottom: 24 }}>
          {[
            { label: "Indexing", state: "done" },
            { label: "Mind map", state: "done" },
            { label: "Wiki pages", state: "active" },
          ].map((p, i, arr) => (
            <React.Fragment key={p.label}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 99, fontSize: 11, fontWeight: 600,
                  display: "grid", placeItems: "center",
                  background: p.state === "done" ? "var(--align-ok-bg)" : p.state === "active" ? "var(--ink)" : "var(--bg-3)",
                  color: p.state === "done" ? "var(--align-ok-fg)" : p.state === "active" ? "#fff" : "var(--ink-4)",
                  border: p.state === "done" ? "1px solid var(--align-ok-bd)" : "0",
                }}>{p.state === "done" ? "✓" : i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: p.state === "active" ? 600 : 500, color: p.state === "active" ? "var(--ink)" : "var(--ink-3)" }}>{p.label}</span>
              </div>
              {i < arr.length - 1 && <div style={{ width: 36, height: 1, background: "var(--line)", margin: "0 14px", alignSelf: "center" }} />}
            </React.Fragment>
          ))}
        </div>
        <div className="jw-card" style={{ textAlign: "left", padding: 14 }}>
          <div className="label-eyebrow" style={{ marginBottom: 10 }}>Recent activity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, color: "var(--ink-2)" }}>
            {[
              { t: "+ 0:04", m: "Generated page Architecture (4 sources, 2 mermaid diagrams)" },
              { t: "+ 0:01", m: "Generated page Indexer pipeline (6 sources)" },
              { t: "- 0:00", m: "Mind map complete · 9 areas, 48 chunks/area mean" },
              { t: "- 1:42", m: "Embedded 23,981 chunks · model text-embedding-3-large" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 12 }}>
                <span className="mono" style={{ color: "var(--ink-4)", width: 56, flexShrink: 0 }}>{row.t}</span>
                <span>{row.m}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </Shell>
);

const WikiEmptyScreen = ({ density }) => (
  <Shell active="repos" admin={true} density={density} screenLabel="04 Wiki · not generated">
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "100px 24px", textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--bg-3)", color: "var(--ink-2)", display: "grid", placeItems: "center", margin: "0 auto 18px" }}>
        <Icon name="book" size={22} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 6px" }}>Wiki not yet generated</h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: "0 auto 20px", maxWidth: 460, lineHeight: 1.55 }}>
        Wiki pages are generated after indexing completes. Re-index from Advanced Settings if this looks stuck.
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
        <button className="jw-btn"><Icon name="chevronLeft" size={12} /> Back to repository</button>
        <button className="jw-btn jw-btn--primary"><Icon name="sparkles" size={12} /> Generate now</button>
      </div>
    </div>
  </Shell>
);

const ChatEmptyScreen = ({ density }) => (
  <Shell active="repos" admin={true} density={density} screenLabel="03 Chat · empty">
    <div className="jw-repo-header">
      <a className="jw-back"><Icon name="chevronLeft" size={12} /> Repositories</a>
      <div className="jw-repo-title">
        <span className="jw-repo-row__icon"><Icon name="git" size={16} /></span>
        <h1>example-org/iam-service</h1>
        <span className="jw-chip jw-chip--dot is-done">Indexed</span>
      </div>
    </div>
    <div className="jw-tabs">
      <button className="jw-tab jw-tab--admin">Documentation</button>
      <button className="jw-tab">Repo Guide</button>
      <button className="jw-tab is-active">Chat <span className="jw-tab__count">0</span></button>
      <button className="jw-tab">Advanced Settings</button>
    </div>
    <div style={{ background: "var(--bg-2)", minHeight: "calc(100% - 130px)", padding: "20px 22px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "260px 1fr", gap: 14 }}>
        <aside className="jw-card" style={{ padding: 20, height: 540 }}>
          <div className="label-eyebrow" style={{ marginBottom: 8 }}>Sessions</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
            No conversations yet. Sessions you start appear here, scoped to this repository.
          </div>
        </aside>
        <section className="jw-card" style={{ padding: 28, display: "flex", flexDirection: "column", height: 540 }}>
          <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center" }}>
            <div style={{ maxWidth: 520 }}>
              <span style={{ width: 44, height: 44, borderRadius: 11, background: "linear-gradient(135deg, #1d4ed8, #6d28d9)", color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
                <Icon name="sparkles" size={18} />
              </span>
              <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 4px" }}>Ask anything about example-org/iam-service</h2>
              <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 20px" }}>Answers are grounded in your code, tests, docs, and history.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, textAlign: "left" }}>
                {[
                  { tier: "A", q: "What does this repository do?" },
                  { tier: "A", q: "Where is the authentication logic?" },
                  { tier: "C", q: "Explain the folder structure." },
                  { tier: "B", q: "Which tests cover token expiry?" },
                ].map((s) => (
                  <button key={s.q} className="jw-btn" style={{ height: "auto", padding: "10px 12px", justifyContent: "flex-start", textAlign: "left", fontWeight: 500 }}>
                    <span className={`jw-chip auth-${s.tier}`} style={{ height: 18, padding: "0 6px", fontSize: 10.5 }}>{s.tier}</span>
                    <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{s.q}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ padding: "10px 12px", border: "1px solid var(--line-strong)", borderRadius: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <textarea placeholder="Ask anything…" rows={1} style={{ flex: 1, border: 0, outline: 0, resize: "none", fontSize: 13.5, fontFamily: "var(--font-sans)", background: "transparent" }} />
            <button className="jw-btn jw-btn--primary jw-btn--sm"><Icon name="send" size={11} /> Send</button>
          </div>
        </section>
      </div>
    </div>
  </Shell>
);

window.AddRepoDialog = AddRepoDialog;
window.EmptyAdminScreen = EmptyAdminScreen;
window.DocsProgressScreen = DocsProgressScreen;
window.WikiEmptyScreen = WikiEmptyScreen;
window.ChatEmptyScreen = ChatEmptyScreen;
