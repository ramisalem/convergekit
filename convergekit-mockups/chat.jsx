// chat.jsx — Chat tab: sessions rail + conversation pane + activity timeline

const SESSIONS = [
  { id: "s1", title: "Embedding profile mismatch root cause", count: 14, when: "2h", active: true },
  { id: "s2", title: "How does scopedRepoQuery filter results?", count: 6, when: "yesterday" },
  { id: "s3", title: "Walk me through the wiki regen job", count: 22, when: "Mon" },
  { id: "s4", title: "Where is the GitHub OAuth callback handled?", count: 8, when: "Apr 28" },
  { id: "s5", title: "What changed in the indexer last week?", count: 11, when: "Apr 24" },
];

const ChatPane = () => {
  return (
    <div style={{ maxWidth: 1408, margin: "0 auto", padding: "16px 22px 24px", display: "grid", gridTemplateColumns: "260px 1fr 320px", gap: 14, height: "calc(100% - 0px)" }}>
      {/* Sessions rail */}
      <aside className="jw-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", height: 640 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em", textTransform: "uppercase" }}>Sessions</div>
          <button className="jw-icon-btn" style={{ width: 26, height: 26 }} title="New chat"><Icon name="plus" size={13} /></button>
        </div>
        <div className="jw-scroll" style={{ flex: 1 }}>
          {SESSIONS.map((s) => (
            <div key={s.id} style={{
              padding: "10px 14px", borderBottom: "1px solid var(--line-2)",
              background: s.active ? "var(--bg-3)" : "transparent",
              borderLeft: s.active ? "2px solid var(--ink)" : "2px solid transparent",
            }}>
              <div style={{ fontSize: 12.5, fontWeight: s.active ? 600 : 500, color: "var(--ink)", lineHeight: 1.35,
                            overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {s.title}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "var(--ink-4)" }}>
                <span>{s.count} messages</span>
                <span>{s.when}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      <section className="jw-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", height: 640 }}>
        <div className="jw-scroll" style={{ flex: 1, padding: "20px 24px 12px" }}>
          {/* user msg */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
            <div style={{ maxWidth: "78%", background: "var(--ink)", color: "#fff", padding: "10px 14px", borderRadius: "14px 14px 4px 14px", fontSize: 13.5, lineHeight: 1.5 }}>
              Why are some embedding jobs failing for example-org/payroll-ledger after we switched providers? Is it our chunk size?
            </div>
          </div>

          {/* assistant msg */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: "linear-gradient(135deg, #1d4ed8, #6d28d9)", color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>CK</span>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>ConvergeKit · Claude Sonnet 4.5</span>
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.55 }}>
              <p style={{ marginTop: 0 }}>
                Yes — chunk size compatibility is the root cause for ~3 of 5 recent failures. After switching to{" "}
                <span className="mono" style={{ background: "var(--bg-3)", padding: "0 4px", borderRadius: 3, fontSize: 12 }}>text-embedding-3-large</span>,
                jobs are still using the previous provider's 512-token chunk profile.
              </p>
              <ol style={{ paddingLeft: 18, margin: "8px 0", display: "flex", flexDirection: "column", gap: 6 }}>
                <li>Embedding profile is captured per-repo at first index <span className="jw-chip auth-A" style={{ marginLeft: 4 }}>indexer/run.ts:84</span></li>
                <li>Provider swap doesn't invalidate the existing profile <span className="jw-chip auth-A" style={{ marginLeft: 4 }}>embeddings.ts:142</span></li>
                <li>The mismatch banner already exists — wired to <span className="mono" style={{ fontSize: 12 }}>compatible: false</span> <span className="jw-chip auth-B" style={{ marginLeft: 4 }}>embedding-compat.test.ts</span></li>
              </ol>
              <div className="jw-codeblock" style={{ marginTop: 12 }}>
                <div className="jw-codeblock__hd">
                  <span><span className="mono">embeddings.ts</span> · lines 138–148</span>
                  <button className="jw-btn jw-btn--sm" style={{ height: 22, padding: "0 6px" }}><Icon name="copy" size={11} /></button>
                </div>
                <pre>
{`if (storedProfile && storedProfile.model !== currentProfile.model) {
  return { compatible: false, reason: 'embedding-model-changed' }
}`}
                </pre>
              </div>
              <p>
                <b>What to do:</b> reindex <span className="mono">example-org/payroll-ledger</span> from Advanced Settings.
                The mismatch banner shows the action; chats are blocked until reindex completes.
              </p>
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg-2)" }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Sources · 5
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="jw-chip auth-A"><b style={{ fontSize: 10, opacity: 0.7 }}>A</b> indexer/run.ts</span>
                <span className="jw-chip auth-A"><b style={{ fontSize: 10, opacity: 0.7 }}>A</b> embeddings.ts</span>
                <span className="jw-chip auth-B"><b style={{ fontSize: 10, opacity: 0.7 }}>B</b> embedding-compat.test.ts</span>
                <span className="jw-chip auth-C"><b style={{ fontSize: 10, opacity: 0.7 }}>C</b> settings-page-revamp-design.md</span>
                <span className="jw-chip auth-D"><b style={{ fontSize: 10, opacity: 0.7 }}>D</b> ADR-021</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 16px 14px", borderTop: "1px solid var(--line)", background: "var(--bg)" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "8px 10px", border: "1px solid var(--line-strong)", borderRadius: 10, background: "var(--bg)" }}>
            <textarea
              placeholder="Ask anything about example-org/core-platform"
              rows={1}
              style={{ flex: 1, border: 0, outline: 0, resize: "none", fontFamily: "var(--font-sans)", fontSize: 13.5, lineHeight: 1.5, color: "var(--ink)", padding: "4px 0", background: "transparent" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>↩ to send</span>
              <button className="jw-btn jw-btn--primary jw-btn--sm" style={{ height: 28 }}>
                <Icon name="send" size={12} /> Send
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Activity timeline */}
      <aside className="jw-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", height: 640 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-2)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em", textTransform: "uppercase" }}>Search agent activity</div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>5 tools · 8.2s</div>
        </div>
        <div className="jw-scroll" style={{ flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { tool: "search_chunks", q: "embedding model swap chunk size", n: 12, ms: 420, tier: "A" },
            { tool: "read_file", q: "embeddings.ts:120-160", n: 1, ms: 80, tier: "A" },
            { tool: "search_docs", q: "embedding profile compatibility", n: 4, ms: 310, tier: "C" },
            { tool: "search_tests", q: "compatible false", n: 2, ms: 260, tier: "B" },
            { tool: "reasoning", q: "Synthesize provider swap path", n: null, ms: 7110, tier: null },
          ].map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <div style={{ width: 16, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2 }}>
                <div style={{ width: 8, height: 8, borderRadius: 99,
                  background: step.tier ? `var(--auth-${step.tier.toLowerCase()}-bd)` : "var(--ink-4)" }} />
                {i < 4 && <div style={{ flex: 1, width: 1, background: "var(--line)", marginTop: 4 }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", display: "flex", alignItems: "center", gap: 6 }}>
                  {step.tool === "reasoning" ? <Icon name="sparkles" size={11} /> : <Icon name="code" size={11} />}
                  <span className="mono">{step.tool}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.q}</div>
                <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 3, display: "flex", gap: 8 }}>
                  {step.n != null && <span>{step.n} hits</span>}
                  <span>{step.ms < 1000 ? `${step.ms}ms` : `${(step.ms/1000).toFixed(1)}s`}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};

window.ChatPane = ChatPane;
