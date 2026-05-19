// wiki.jsx — Wiki article reader: 3-column (rail / article / TOC)

const WIKI_TREE = [
  { section: "Overview", pages: [
    { slug: "introduction", title: "Introduction", active: false },
    { slug: "architecture", title: "Architecture", active: true },
    { slug: "data-flow", title: "Data flow" },
  ]},
  { section: "Indexing", pages: [
    { slug: "indexer-pipeline", title: "Indexer pipeline" },
    { slug: "embeddings", title: "Embeddings & profiles" },
    { slug: "wiki-generation", title: "Wiki generation" },
    { slug: "mind-map", title: "Mind map", pending: true },
  ]},
  { section: "Surfaces", pages: [
    { slug: "repo-guide", title: "Repo Guide" },
    { slug: "chat", title: "Chat" },
    { slug: "wiki-reader", title: "Wiki reader" },
  ]},
  { section: "Operations", pages: [
    { slug: "mcp-tokens", title: "MCP tokens" },
    { slug: "access-policy", title: "Access policy" },
  ]},
];

const TOC = [
  { id: "overview", level: 2, label: "Overview", active: true },
  { id: "indexing", level: 2, label: "The indexing pipeline" },
  { id: "phases", level: 3, label: "Three phases" },
  { id: "evidence", level: 3, label: "Evidence authority" },
  { id: "wiki-gen", level: 2, label: "Wiki generation" },
  { id: "retrieval", level: 2, label: "Retrieval at query time" },
];

const WikiScreen = ({ density, admin = true, onBack }) => {
  return (
    <Shell active="repos" admin={admin} density={density} screenLabel="04 Wiki article">
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 240px", height: "100%", background: "var(--bg)" }}>
        {/* Left rail */}
        <aside style={{ borderRight: "1px solid var(--line)", overflow: "auto", padding: "20px 14px" }}>
          <a className="jw-back" onClick={onBack} style={{ marginBottom: 14 }}>
            <Icon name="chevronLeft" size={12} /> example-org/core-platform
          </a>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 14 }}>
            Indexed 2h ago · <span className="mono">a14f9b2</span>
          </div>
          {WIKI_TREE.map((s) => (
            <div key={s.section} style={{ marginBottom: 14 }}>
              <div className="label-eyebrow" style={{ fontSize: 10.5, marginBottom: 6, padding: "0 8px" }}>{s.section}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {s.pages.map((p) => (
                  <a key={p.slug} style={{
                    fontSize: 13, padding: "5px 8px", borderRadius: 5,
                    color: p.active ? "var(--ink)" : p.pending ? "var(--ink-4)" : "var(--ink-2)",
                    background: p.active ? "var(--bg-3)" : "transparent",
                    fontWeight: p.active ? 600 : 400,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    {p.title}
                    {p.pending && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-4)", padding: "1px 6px", background: "var(--bg-3)", borderRadius: 99 }}>generating</span>}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </aside>

        {/* Article */}
        <article className="jw-scroll" style={{ overflow: "auto", padding: "32px 56px" }}>
          <div style={{ maxWidth: 720 }}>
            <div className="label-eyebrow" style={{ marginBottom: 8 }}>Overview · 4 of 18</div>
            <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.025em", margin: "0 0 6px", lineHeight: 1.15 }}>
              Architecture
            </h1>
            <p style={{ fontSize: 15.5, color: "var(--ink-3)", margin: "0 0 20px", lineHeight: 1.55 }}>
              How ConvergeKit ingests a repository, derives evidence, and answers questions with grounded citations.
            </p>

            {/* Source files accordion */}
            <details open style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 0, marginBottom: 24, background: "var(--bg-2)" }}>
              <summary style={{ padding: "10px 14px", cursor: "default", display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--ink-2)", fontWeight: 500 }}>
                <Icon name="folder" size={13} />
                Relevant source files · 6
                <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <span className="jw-chip auth-A">3 Code</span>
                  <span className="jw-chip auth-B">1 Test</span>
                  <span className="jw-chip auth-C">1 Doc</span>
                  <span className="jw-chip auth-D">1 ADR</span>
                </span>
              </summary>
              <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  { tier: "A", path: "apps/api/src/services/indexer/run.ts" },
                  { tier: "A", path: "apps/api/src/services/wiki/generator.ts" },
                  { tier: "A", path: "apps/api/src/routes/chat.ts" },
                  { tier: "B", path: "apps/api/src/services/indexer/run.test.ts" },
                  { tier: "C", path: "docs/superpowers/specs/2026-05-07-code-grounded-indexing-design.md" },
                  { tier: "D", path: "docs/adr/2025-11-evidence-tiers.md" },
                ].map((s, i) => (
                  <div key={i} className={`jw-bar auth-${s.tier}`}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.7, fontFamily: "var(--font-mono)" }}>Tier {s.tier}</span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>{s.path}</span>
                  </div>
                ))}
              </div>
            </details>

            <h2 id="overview" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em", margin: "32px 0 10px" }}>Overview</h2>
            <p>ConvergeKit transforms a repository into four layers of evidence: <em>chunks</em>, <em>summaries</em>, <em>wiki pages</em>, and a <em>mind map</em>. Every answer is traceable back to a tier — Code <span className="jw-chip auth-A" style={{ verticalAlign: "middle" }}>A</span>, Tests <span className="jw-chip auth-B" style={{ verticalAlign: "middle" }}>B</span>, Docs <span className="jw-chip auth-C" style={{ verticalAlign: "middle" }}>C</span>, or Design / History <span className="jw-chip auth-D" style={{ verticalAlign: "middle" }}>D</span>.</p>

            <h2 id="indexing" style={{ fontSize: 22, fontWeight: 600, margin: "32px 0 10px" }}>The indexing pipeline</h2>
            <h3 id="phases" style={{ fontSize: 16, fontWeight: 600, margin: "20px 0 6px" }}>Three phases</h3>
            <p>Indexing runs as three sequential job phases: <span className="mono">repository-analysis</span>, <span className="mono">mind-map</span>, and <span className="mono">wiki-generation</span>. The first is the longest; the latter two reuse its output.</p>
            <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <li><b>repository-analysis</b> — clone, parse, chunk, and embed all source files.</li>
              <li><b>mind-map</b> — derive repo areas and tier weights from the embeddings.</li>
              <li><b>wiki-generation</b> — generate sections and per-page articles grounded in chunks.</li>
            </ol>

            <h3 id="evidence" style={{ fontSize: 16, fontWeight: 600, margin: "24px 0 6px" }}>Evidence authority</h3>
            <p>Tier C uses a slate/neutral family on purpose: operational documentation must not visually collide with the orange <span className="jw-chip align-stale" style={{ verticalAlign: "middle" }}>stale</span> alignment state.</p>
            <blockquote style={{ borderLeft: "3px solid var(--line-strong)", margin: "16px 0", padding: "4px 14px", color: "var(--ink-2)", background: "var(--bg-2)", borderRadius: "0 6px 6px 0" }}>
              <p style={{ margin: 0, fontSize: 13.5 }}>
                Tier D citations must not look identical to Tier A. The palette anchors this distinction and survives any visual modernization.
              </p>
            </blockquote>

            <h2 id="wiki-gen" style={{ fontSize: 22, fontWeight: 600, margin: "32px 0 10px" }}>Wiki generation</h2>
            <p>Wiki pages are generated from chunks with prompts that require literal source citations. Citations rendered without an <span className="mono">href</span> become inline badges so the reader can hover for tier provenance.</p>

            <div className="jw-codeblock" style={{ marginTop: 14 }}>
              <div className="jw-codeblock__hd">
                <span><span className="mono">wiki/generator.ts</span> · citation regex</span>
                <button className="jw-btn jw-btn--sm" style={{ height: 22, padding: "0 6px" }}><Icon name="copy" size={11} /></button>
              </div>
              <pre>
{`const CITE = /\\[\\^(?<tier>[A-D])(?<idx>\\d+)\\]/g

function renderCitation(match: RegExpMatchArray, sources: Source[]) {
  const { tier, idx } = match.groups!
  const src = sources[Number(idx)]
  return <CitationBadge tier={tier} source={src} />
}`}
              </pre>
            </div>

            <h2 id="retrieval" style={{ fontSize: 22, fontWeight: 600, margin: "32px 0 10px" }}>Retrieval at query time</h2>
            <p>Chat retrieval combines a vector search across chunks with a re-rank step that prefers code-grounded results. When evidence quality drops below a threshold, the assistant declines to answer rather than hallucinating across tiers.</p>
          </div>
        </article>

        {/* Right TOC */}
        <aside style={{ borderLeft: "1px solid var(--line)", padding: "32px 22px", overflow: "auto" }}>
          <div className="label-eyebrow" style={{ marginBottom: 12 }}>On this page</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {TOC.map((h) => (
              <a key={h.id} style={{
                fontSize: 12.5,
                paddingLeft: h.level === 3 ? 12 : 0,
                color: h.active ? "var(--ink)" : "var(--ink-3)",
                fontWeight: h.active ? 600 : 400,
                borderLeft: h.active ? "2px solid var(--ink)" : "2px solid transparent",
                paddingTop: 2, paddingBottom: 2,
                marginLeft: -2,
                paddingLeft: h.level === 3 ? 14 : 8,
              }}>{h.label}</a>
            ))}
          </div>
        </aside>
      </div>
    </Shell>
  );
};

window.WikiScreen = WikiScreen;
