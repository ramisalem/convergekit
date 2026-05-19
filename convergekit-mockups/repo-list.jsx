// repo-list.jsx — Repository list screen

const REPOS = [
  { id: "core", name: "example-org/core-platform", url: "github.com/example-org/core-platform", provider: "github", status: "done", indexed: "2 hours ago", lang: "TypeScript", size: "184k LOC", chats: 28 },
  { id: "ledger", name: "example-org/payroll-ledger", url: "github.com/example-org/payroll-ledger", provider: "github", status: "processing", indexed: "indexing now", lang: "Rust", size: "62k LOC", chats: 4, jobPhase: "wiki" },
  { id: "mobile", name: "example-org/mobile-app", url: "github.com/example-org/mobile-app", provider: "github", status: "done", indexed: "yesterday", lang: "Swift / Kotlin", size: "118k LOC", chats: 11 },
  { id: "iam", name: "example-org/iam-service", url: "github.com/example-org/iam-service", provider: "github", status: "done", indexed: "3 days ago", lang: "Go", size: "41k LOC", chats: 17 },
  { id: "etl", name: "example-org/data-pipeline", url: "github.com/example-org/data-pipeline", provider: "github", status: "failed", indexed: "failed 6h ago", lang: "Python", size: "—", chats: 0 },
  { id: "infra", name: "example-org/infra-terraform", url: "github.com/example-org/infra-terraform", provider: "github", status: "pending", indexed: "queued", lang: "HCL", size: "—", chats: 0 },
];

const StatusChip = ({ status }) => {
  const labels = { pending: "Pending", processing: "Processing", done: "Indexed", failed: "Failed" };
  return <span className={`jw-chip jw-chip--dot is-${status}`}>{labels[status]}</span>;
};

const RepoListScreen = ({ density, admin = true, onOpenRepo }) => {
  const [q, setQ] = React.useState("");
  const filtered = REPOS.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Shell active="repos" admin={admin} density={density} screenLabel="01 Repositories">
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 60px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <div className="label-eyebrow" style={{ marginBottom: 6 }}>Workspace</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>Repositories</h1>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 13.5 }}>
              {filtered.length} repositories · scoped to <span className="mono" style={{ color: "var(--ink-2)" }}>example-engineering</span> group
            </p>
          </div>
          {admin && (
            <button className="jw-btn jw-btn--primary">
              <Icon name="plus" /> Add repository
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div className="jw-search" style={{ flex: 1 }}>
            <Icon name="search" />
            <input className="jw-input" placeholder="Search repositories" value={q}
                   onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="jw-btn">
            <Icon name="list" /> Status
            <Icon name="chevronDown" size={12} />
          </button>
          <button className="jw-btn">
            <Icon name="git" /> Provider
            <Icon name="chevronDown" size={12} />
          </button>
        </div>

        <div className="jw-card" style={{ overflow: "hidden" }}>
          {filtered.map((r) => (
            <div key={r.id} className="jw-repo-row" onClick={() => onOpenRepo?.(r.id)}>
              <span className="jw-repo-row__icon"><Icon name="git" /></span>
              <div style={{ minWidth: 0 }}>
                <div className="jw-repo-row__name">{r.name}</div>
                <div className="jw-repo-row__url">{r.url}</div>
              </div>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{r.lang}</div>
                <div style={{ fontSize: 12, color: "var(--ink-4)" }}>{r.size} · {r.chats} chats</div>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", textAlign: "right" }}>
                {r.status === "processing" && r.jobPhase ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: "#f59e0b", boxShadow: "0 0 0 4px rgba(245,158,11,.18)" }} />
                    Wiki generation · 64%
                  </span>
                ) : r.indexed}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <StatusChip status={r.status} />
                <Icon name="chevron" stroke={1.5} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
};

window.RepoListScreen = RepoListScreen;
window.StatusChip = StatusChip;
