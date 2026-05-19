// repo-detail.jsx — Repository detail shell with tabs
// Tabs: Documentation (admin), Repo Guide, Chat, Advanced Settings
// Wiki link surfaces when status === done

const RepoDetailScreen = ({ density, admin = true, initialTab = "guide", screenLabel, onOpenWiki }) => {
  const [tab, setTab] = React.useState(initialTab);
  const repo = {
    name: "example-org/core-platform",
    provider: "github.com",
    branch: "main",
    sha: "a14f9b2",
    indexed: "2 hours ago",
    docs: 1842,
    chunks: 23981,
    pages: 47,
  };

  return (
    <Shell active="repos" admin={admin} density={density} screenLabel={screenLabel || `02 Repository · ${tab}`}>
      <div className="jw-repo-header">
        <a className="jw-back"><Icon name="chevronLeft" size={12} /> Repositories</a>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div className="jw-repo-title">
              <span className="jw-repo-row__icon"><Icon name="git" size={16} /></span>
              <h1>{repo.name}</h1>
              <StatusChip status="done" />
            </div>
            <div className="jw-repo-meta">
              <span className="mono">{repo.provider}/{repo.name}</span>
              <span className="dot" />
              <span><span className="kbd">{repo.branch}</span> @ <span className="mono">{repo.sha}</span></span>
              <span className="dot" />
              <span>Indexed {repo.indexed}</span>
              <span className="dot" />
              <span>{repo.docs.toLocaleString()} files · {repo.chunks.toLocaleString()} chunks · {repo.pages} wiki pages</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="jw-btn jw-btn--sm" onClick={() => onOpenWiki?.()}>
              <Icon name="book" /> View Wiki
              <Icon name="chevron" size={12} />
            </button>
            <button className="jw-btn jw-btn--sm" title="Reindex">
              <Icon name="refresh" />
            </button>
          </div>
        </div>
      </div>

      <div className="jw-tabs">
        {admin && (
          <button className={`jw-tab jw-tab--admin ${tab === "docs" ? "is-active" : ""}`}
                  onClick={() => setTab("docs")}>
            Documentation
          </button>
        )}
        <button className={`jw-tab ${tab === "guide" ? "is-active" : ""}`} onClick={() => setTab("guide")}>
          Repo Guide
        </button>
        <button className={`jw-tab ${tab === "chat" ? "is-active" : ""}`} onClick={() => setTab("chat")}>
          Chat <span className="jw-tab__count">28</span>
        </button>
        <button className={`jw-tab ${tab === "settings" ? "is-active" : ""}`} onClick={() => setTab("settings")}>
          Advanced Settings
        </button>
      </div>

      <div style={{ background: "var(--bg-2)", minHeight: "calc(100% - 130px)" }}>
        {tab === "guide" && <RepoGuide />}
        {tab === "chat" && <ChatPane />}
        {tab === "docs" && <DocsTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </Shell>
  );
};

// ─── Documentation tab (admin) — file browser state ─────────────────
const DocsTab = () => {
  const files = [
    { path: "apps/api/src/routes/auth.ts", lang: "TypeScript", lines: 142 },
    { path: "apps/api/src/routes/repositories.ts", lang: "TypeScript", lines: 318, active: true },
    { path: "apps/api/src/routes/chat.ts", lang: "TypeScript", lines: 256 },
    { path: "apps/api/src/services/indexer/run.ts", lang: "TypeScript", lines: 481 },
    { path: "apps/api/src/services/indexer/embeddings.ts", lang: "TypeScript", lines: 219 },
    { path: "apps/api/src/services/wiki/generator.ts", lang: "TypeScript", lines: 612 },
    { path: "apps/web/src/components/repository-detail/repo-guide-tab.tsx", lang: "TSX", lines: 188 },
    { path: "apps/web/src/components/repository-detail/chat-tab.tsx", lang: "TSX", lines: 401 },
    { path: "packages/shared/src/evidence.ts", lang: "TypeScript", lines: 92 },
  ];
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 22px 40px" }}>
      <div className="jw-card" style={{ marginBottom: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, background: "#fffbeb", borderColor: "#fde68a" }}>
        <span style={{ color: "#b45309" }}><Icon name="info" /></span>
        <div style={{ fontSize: 13, color: "#92400e" }}>
          <b>Wiki regeneration in progress</b> — indexed documents stay browsable; new wiki pages appear when generation completes (~6 min).
        </div>
        <button className="jw-btn jw-btn--sm" style={{ marginLeft: "auto" }}>View progress</button>
      </div>

      <div className="jw-card" style={{ display: "grid", gridTemplateColumns: "320px 1fr", overflow: "hidden", height: 540 }}>
        <div style={{ borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line-2)" }}>
            <div className="jw-search">
              <Icon name="search" />
              <input className="jw-input" placeholder="Filter 1,842 files" />
            </div>
          </div>
          <div className="jw-scroll" style={{ flex: 1 }}>
            {files.map((f) => (
              <div key={f.path} style={{
                padding: "8px 12px", borderBottom: "1px solid var(--line-2)",
                background: f.active ? "var(--bg-3)" : "transparent",
                cursor: "default",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="file" size={13} stroke={1.5} style={{ color: "var(--ink-4)" }} />
                  <span className="mono" style={{ fontSize: 12, fontWeight: f.active ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.path}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 21, marginTop: 2 }}>
                  {f.lang} · {f.lines} lines
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line-2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>apps/api/src/routes/repositories.ts</span>
              <span className="jw-chip auth-A">TypeScript</span>
            </div>
            <button className="jw-btn jw-btn--sm"><Icon name="copy" /></button>
          </div>
          <div className="jw-scroll" style={{ flex: 1, padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6 }}>
            <div><span className="tok-c">// Repository CRUD + indexing trigger</span></div>
            <div><span className="tok-k">import</span> {"{"} Hono {"}"} <span className="tok-k">from</span> <span className="tok-s">'hono'</span></div>
            <div><span className="tok-k">import</span> {"{"} z {"}"} <span className="tok-k">from</span> <span className="tok-s">'zod'</span></div>
            <div><span className="tok-k">import</span> {"{"} db, repositories {"}"} <span className="tok-k">from</span> <span className="tok-s">'@/db'</span></div>
            <div>&nbsp;</div>
            <div><span className="tok-k">const</span> <span className="tok-f">app</span> = <span className="tok-k">new</span> Hono()</div>
            <div>&nbsp;</div>
            <div>app.<span className="tok-f">get</span>(<span className="tok-s">'/'</span>, <span className="tok-k">async</span> (c) =&gt; {"{"}</div>
            <div>&nbsp;&nbsp;<span className="tok-k">const</span> session = <span className="tok-k">await</span> <span className="tok-f">requireSession</span>(c)</div>
            <div>&nbsp;&nbsp;<span className="tok-k">const</span> rows = <span className="tok-k">await</span> <span className="tok-f">scopedRepoQuery</span>(session.user)</div>
            <div>&nbsp;&nbsp;<span className="tok-k">return</span> c.<span className="tok-f">json</span>({"{"} repositories: rows {"}"})</div>
            <div>{"}"})</div>
          </div>
        </div>
      </div>
    </div>
  );
};

window.RepoDetailScreen = RepoDetailScreen;
window.DocsTab = DocsTab;
