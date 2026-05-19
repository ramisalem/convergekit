// auth-screens.jsx — Landing, Sign-in (user/admin), Accept invite

const LandingScreen = ({ density }) => (
  <Shell active="repos" admin={false} density={density} screenLabel="00 Landing">
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "80px 24px 60px" }}>
      <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 56px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", border: "1px solid var(--line)", borderRadius: 999, fontSize: 12, color: "var(--ink-3)", background: "var(--bg)", marginBottom: 22 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: "#16a34a" }} /> Alignment infrastructure for software teams
        </span>
        <h1 style={{ fontSize: 52, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.05, margin: "0 0 16px" }}>
          Bring product intent,<br/>code reality, and agent context together.
        </h1>
        <p style={{ fontSize: 17, color: "var(--ink-3)", lineHeight: 1.55, margin: 0 }}>
          ConvergeKit turns repositories into a shared evidence layer so product teams,
          engineers, and AI agents can work from the same understanding.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28 }}>
          <button className="jw-btn jw-btn--primary" style={{ height: 38, padding: "0 18px", fontSize: 14 }}>Open repositories <Icon name="chevron" size={13} /></button>
          <button className="jw-btn" style={{ height: 38, padding: "0 18px", fontSize: 14 }}>Sign in</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 14 }}>
        {[
          { eyebrow: "For product", title: "Ground decisions in code", body: "Stop relying on memory. Ask what the product does, see the evidence." },
          { eyebrow: "For engineers", title: "Onboard in hours, not weeks", body: "Read the wiki, ask the chat, follow citations back to the file that proves it." },
          { eyebrow: "For agents", title: "Same map, programmatic access", body: "MCP tokens give Claude Desktop, Cursor, and CI agents identical scope." },
        ].map((c) => (
          <div key={c.eyebrow} className="jw-card" style={{ padding: 22 }}>
            <div className="label-eyebrow" style={{ marginBottom: 10 }}>{c.eyebrow}</div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.012em", marginBottom: 6 }}>{c.title}</div>
            <div style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.5 }}>{c.body}</div>
          </div>
        ))}
      </div>

      <div className="jw-card" style={{ padding: 24 }}>
        <div className="label-eyebrow" style={{ marginBottom: 14 }}>The loop</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, position: "relative" }}>
          {[
            { n: "01", h: "Index the codebase", b: "Clone, parse, embed. Mind-map the architecture into evidence tiers." },
            { n: "02", h: "Ask and verify", b: "Chat or read the wiki. Every answer carries its sources." },
            { n: "03", h: "Decide from one truth", b: "Engineers and agents see the same evidence. No two stories about the same code." },
          ].map((s, i) => (
            <div key={s.n} style={{ position: "relative", paddingLeft: 6 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 8 }}>{s.n}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{s.h}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>{s.b}</div>
              {i < 2 && <div style={{ position: "absolute", right: -12, top: 12, color: "var(--ink-4)" }}><Icon name="chevron" size={12} /></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  </Shell>
);

const SignInScreen = ({ density, mode = "user" }) => {
  const [tab, setTab] = React.useState(mode);
  return (
    <Shell active="repos" admin={false} density={density} screenLabel={`00 Sign-in · ${tab}`}>
      <div style={{ display: "grid", placeItems: "center", padding: "60px 24px", minHeight: "calc(100% - 0px)" }}>
        <div style={{ width: 380 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 22 }}>
            <span className="jw-brand-mark" style={{ width: 32, height: 32, fontSize: 13 }}>CK</span>
          </div>
          <div className="jw-card" style={{ padding: 26 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.018em", margin: "0 0 4px", textAlign: "center" }}>Welcome back</h1>
            <p style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center", margin: "0 0 20px" }}>Sign in to access your repositories.</p>

            <div role="tablist" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: 3, gap: 2, background: "var(--bg-3)", borderRadius: 8, marginBottom: 18 }}>
              {["user", "admin"].map((k) => (
                <button key={k} onClick={() => setTab(k)} className="jw-btn" style={{
                  height: 28, fontSize: 12.5, fontWeight: 500, textTransform: "capitalize",
                  background: tab === k ? "var(--bg)" : "transparent",
                  borderColor: tab === k ? "var(--line)" : "transparent",
                  boxShadow: tab === k ? "var(--shadow-sm)" : "none",
                }}>{k}</button>
              ))}
            </div>

            {tab === "user" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, marginBottom: 5, display: "block", color: "var(--ink-2)" }}>Work email</label>
                  <input className="jw-input" placeholder="reza@example.com" />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>Password</label>
                    <a style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Forgot?</a>
                  </div>
                  <input type="password" className="jw-input" defaultValue="••••••••••" />
                </div>
                <button className="jw-btn jw-btn--primary" style={{ width: "100%", height: 36 }}>Sign in</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <button className="jw-btn" style={{ width: "100%", height: 40, background: "#0e1116", color: "#fff", borderColor: "#0e1116" }}>
                  <Icon name="git" size={15} /> Continue with GitHub
                </button>
                <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5, padding: "10px 12px", background: "var(--bg-2)", border: "1px solid var(--line-2)", borderRadius: 8 }}>
                  Admin access requires membership in <span className="mono" style={{ color: "var(--ink-2)" }}>example-engineering</span> on GitHub.
                </div>
              </div>
            )}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--ink-4)", textAlign: "center", margin: "16px 24px 0", lineHeight: 1.5 }}>
            By signing in you agree to your organization's data handling policy. We don't train on your code.
          </p>
        </div>
      </div>
    </Shell>
  );
};

const AcceptInviteScreen = ({ density }) => (
  <Shell active="repos" admin={false} density={density} screenLabel="00 Accept invite">
    <div style={{ display: "grid", placeItems: "center", padding: "60px 24px", minHeight: "calc(100% - 0px)" }}>
      <div style={{ width: 420 }}>
        <div className="jw-card" style={{ padding: 26 }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: "#dbeafe", color: "#1d4ed8", display: "grid", placeItems: "center", marginBottom: 16 }}>
            <Icon name="users" size={18} />
          </span>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 4px" }}>Set up your account</h1>
          <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 20px" }}>
            Invited as <b style={{ color: "var(--ink)" }}>tomas@example.com</b> · Data group
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, marginBottom: 5, display: "block", color: "var(--ink-2)" }}>Choose a password</label>
              <input type="password" className="jw-input" defaultValue="••••••••••" />
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>Minimum 8 characters.</div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, marginBottom: 5, display: "block", color: "var(--ink-2)" }}>Confirm password</label>
              <input type="password" className="jw-input" defaultValue="••••••••••" />
            </div>
            <div style={{ display: "flex", gap: 7, padding: "8px 10px", border: "1px solid #a7f3d0", borderRadius: 6, background: "#ecfdf5", color: "#047857", fontSize: 12.5 }}>
              <Icon name="check" size={13} /> Passwords match
            </div>
            <button className="jw-btn jw-btn--primary" style={{ width: "100%", height: 36, marginTop: 4 }}>Save and continue</button>
          </div>
        </div>
      </div>
    </div>
  </Shell>
);

window.LandingScreen = LandingScreen;
window.SignInScreen = SignInScreen;
window.AcceptInviteScreen = AcceptInviteScreen;
