// repo-guide.jsx — Repo Guide tab.
// Side-by-side: [Current shape] area-coverage  vs  [Proposed] question-first confidence.
// Toggle compares the two redesign directions per the brief.

const AREAS = [
  { name: "Auth & sessions", path: "apps/api/src/auth", tiers: { A: 62, B: 24, C: 10, D: 4 }, confidence: "high" },
  { name: "Indexer pipeline", path: "apps/api/src/services/indexer", tiers: { A: 71, B: 12, C: 14, D: 3 }, confidence: "high" },
  { name: "Wiki generator", path: "apps/api/src/services/wiki", tiers: { A: 48, B: 6, C: 36, D: 10 }, confidence: "medium" },
  { name: "Repo Guide", path: "apps/web/src/components/repository-detail", tiers: { A: 35, B: 28, C: 30, D: 7 }, confidence: "medium" },
  { name: "MCP tokens", path: "apps/api/src/routes/mcp", tiers: { A: 58, B: 31, C: 8, D: 3 }, confidence: "high" },
  { name: "Access policy", path: "apps/api/src/policy", tiers: { A: 42, B: 18, C: 28, D: 12 }, confidence: "low" },
];

const QUESTIONS = [
  {
    q: "How does sign-in work for invited users vs admins?",
    confidence: 4, route: "Code + Docs",
    primary: "A", secondary: "C",
    rationale: "Heavy code coverage in apps/api/src/routes/auth.ts and 4 spec docs. Tests confirm role split.",
    sources: [
      { tier: "A", label: "auth.ts", count: 3 },
      { tier: "B", label: "auth.test.ts", count: 2 },
      { tier: "C", label: "user-types-design.md", count: 1 },
    ],
    align: "ok",
  },
  {
    q: "What guarantees a one-time MCP token reveal?",
    confidence: 4, route: "Code + Tests",
    primary: "A", secondary: "B",
    rationale: "Hardening contract test pins reveal-once behavior; matched in mcp-tokens.ts.",
    sources: [
      { tier: "A", label: "mcp-tokens.ts", count: 2 },
      { tier: "B", label: "mcp-token-hardening-contract.test.ts", count: 1 },
    ],
    align: "ok",
  },
  {
    q: "Why does wiki regeneration sometimes leave pending pages?",
    confidence: 2, route: "Tests + Docs",
    primary: "B", secondary: "C",
    rationale: "Behavioral spec covers happy path; failure mode documented in regenerate-wiki-design.md but tests are thin.",
    sources: [
      { tier: "B", label: "wiki-jobs.test.ts", count: 1 },
      { tier: "C", label: "regenerate-wiki-design.md", count: 1 },
      { tier: "D", label: "ADR-014", count: 1 },
    ],
    align: "stale",
  },
  {
    q: "Can a standard user trigger a re-index?",
    confidence: 5, route: "Code-grounded",
    primary: "A", secondary: "B",
    rationale: "Permission test asserts admin-only; matched in route guard.",
    sources: [
      { tier: "A", label: "repositories.ts", count: 1 },
      { tier: "B", label: "repository-action-permissions.test.ts", count: 1 },
    ],
    align: "ok",
  },
  {
    q: "Which models are interchangeable for embeddings?",
    confidence: 1, route: "Docs only",
    primary: "C", secondary: null,
    rationale: "No code-level constraint enforced; provider docs disagree on chunk size compatibility.",
    sources: [
      { tier: "C", label: "settings-page-revamp-design.md", count: 1 },
      { tier: "D", label: "thread #eng-ml", count: 1 },
    ],
    align: "conflict",
  },
];

const TIER_LABELS = { A: "Code", B: "Tests", C: "Docs", D: "Design / History" };

const TierLegend = () => (
  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: "var(--ink-3)" }}>
    {Object.keys(TIER_LABELS).map((k) => (
      <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: `var(--auth-${k.toLowerCase()}-bd)` }} />
        Tier {k} · {TIER_LABELS[k]}
      </span>
    ))}
  </div>
);

const Stackbar = ({ tiers }) => {
  const total = tiers.A + tiers.B + tiers.C + tiers.D;
  return (
    <div className="jw-stackbar" title={`Tier mix: ${tiers.A}A / ${tiers.B}B / ${tiers.C}C / ${tiers.D}D`}>
      {["A","B","C","D"].map((k) => tiers[k] > 0 && (
        <i key={k} className={`tier-${k}`} style={{ width: `${(tiers[k]/total)*100}%` }} />
      ))}
    </div>
  );
};

const ConfidenceMeter = ({ value, tier }) => (
  <div className={`jw-meter jw-meter--auth-${tier}`}>
    {[1,2,3,4,5].map((i) => <span key={i} className={i <= value ? "on" : ""} />)}
  </div>
);

// ── Current direction: area coverage ─────────────────────────────────
const CurrentRepoGuide = () => (
  <div className="jw-card" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
    <div className="jw-card__hd" style={{ paddingBottom: 10 }}>
      <div>
        <div className="label-eyebrow" style={{ marginBottom: 4 }}>Current</div>
        <div className="jw-card__title">Coverage by repository area</div>
        <div className="jw-card__sub">Shows where evidence is strong, ranked by the mind-map.</div>
      </div>
    </div>
    <div className="jw-card__body" style={{ flex: 1, overflow: "auto" }}>
      <div style={{ marginBottom: 14 }}><TierLegend /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {AREAS.map((a) => (
          <div key={a.name}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{a.path}</div>
              </div>
              <span className={`jw-chip ${a.confidence === "high" ? "align-ok" : a.confidence === "medium" ? "auth-C" : "align-stale"}`}>
                {a.confidence} confidence
              </span>
            </div>
            <Stackbar tiers={a.tiers} />
            <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11.5, color: "var(--ink-4)" }}>
              <span>A {a.tiers.A}%</span><span>B {a.tiers.B}%</span>
              <span>C {a.tiers.C}%</span><span>D {a.tiers.D}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── Proposed: question-first confidence cards + routing matrix ─────
const ProposedRepoGuide = () => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div className="jw-card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="jw-card__hd" style={{ paddingBottom: 10 }}>
          <div>
            <div className="label-eyebrow" style={{ marginBottom: 4, color: "#0e1116" }}>Proposed · question-first</div>
            <div className="jw-card__title">What we can answer with high confidence</div>
            <div className="jw-card__sub">Cards rank questions by evidence strength, primary tier, and alignment.</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="jw-btn jw-btn--sm">All routes</button>
          </div>
        </div>
        <div className="jw-card__body" style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {QUESTIONS.map((Q) => (
            <div key={Q.q} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, background: "var(--bg)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <ConfidenceMeter value={Q.confidence} tier={Q.primary} />
                    <span style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 500 }}>
                      {Q.confidence}/5 · routed via {Q.route}
                    </span>
                    <span className={`jw-chip align-${Q.align === "ok" ? "ok" : Q.align === "stale" ? "stale" : "conflict"}`} style={{ marginLeft: "auto" }}>
                      {Q.align === "ok" ? "Aligned" : Q.align === "stale" ? "Stale" : "Conflicting"}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>{Q.q}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>{Q.rationale}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {Q.sources.map((s, i) => (
                      <span key={i} className={`jw-chip auth-${s.tier}`}>
                        <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.65 }}>{s.tier}</span>
                        {s.label}
                        {s.count > 1 && <span style={{ opacity: 0.5 }}>×{s.count}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Two complementary lenses, always shown together ──────────────────
const RepoGuide = () => (
  <div style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 22px 32px", display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Repo Guide
        </h2>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
          Two lenses on the same evidence — coverage by area, and what the repo can answer with confidence.
        </p>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="jw-btn jw-btn--sm"><Icon name="refresh" size={11} /> Re-rank</button>
        <button className="jw-btn jw-btn--sm">Export</button>
      </div>
    </div>

    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <CurrentRepoGuide />
      <ProposedRepoGuide />
    </div>

    <div className="jw-card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ color: "var(--ink-3)" }}><Icon name="info" size={15} /></span>
      <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
        <b>Reading both:</b> Coverage shows where the index is densest. Questions shows what users can actually ask with confidence — the same evidence, projected onto questions instead of folders.
      </div>
    </div>
  </div>
);

window.RepoGuide = RepoGuide;
