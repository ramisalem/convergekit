// shell.jsx — Top app shell shared across screens

const Shell = ({ active = "repos", admin = true, density, onDensity, children, screenLabel }) => {
  return (
    <div className="jw" data-density={density} data-screen-label={screenLabel}>
      <header className="jw-top">
        <div className="jw-top__left">
          <a className="jw-brand">
            <span className="jw-brand-mark">CK</span>
            ConvergeKit
          </a>
          <nav className="jw-nav">
            <a className={active === "repos" ? "is-active" : ""}>Repositories</a>
            {admin && <a className={active === "settings" ? "is-active" : ""}>Settings</a>}
          </nav>
        </div>
        <div className="jw-top__right">
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
            <span className="kbd">⌘</span> <span className="kbd">K</span>
          </span>
          <span className="jw-avatar">{admin ? "AS" : "RA"}</span>
        </div>
      </header>
      <main style={{ height: "calc(100% - 52px)", overflow: "auto" }}>{children}</main>
    </div>
  );
};

// Tiny SVG icons (lucide-style)
const Icon = ({ name, size = 14, stroke = 1.75, ...rest }) => {
  const paths = {
    chevron: "m9 18 6-6-6-6",
    chevronDown: "m6 9 6 6 6-6",
    chevronLeft: "m15 18-6-6 6-6",
    arrowLeft: "M19 12H5 m12-7-7 7 7 7",
    plus: "M12 5v14 M5 12h14",
    search: "M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M16 16l5 5",
    git: "M5 3v18 M19 3v18 M5 9c8 0 6 6 14 6",
    book: "M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2V5Z M4 19h15",
    chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z",
    cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
    folder: "M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z",
    sparkles: "M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z M19 14l.7 2.1L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-.9L19 14Z",
    check: "M20 6 9 17l-5-5",
    alert: "M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
    copy: "M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4 M5 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z",
    eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    lock: "M5 11V8a7 7 0 1 1 14 0v3 M4 11h16v10H4z",
    play: "M5 3v18l16-9z",
    refresh: "M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5",
    send: "m22 2-7 20-4-9-9-4 20-7Z",
    user: "M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
    users: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M22 21v-2a4 4 0 0 0-3-3.9 M15 3.1a4 4 0 0 1 0 7.8",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
    code: "m16 18 6-6-6-6 M8 6 2 12l6 6",
    list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
    slash: "M22 2 2 22",
    info: "M12 16v-4 M12 8h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    spark: "M5 3v4 M3 5h4 M19 17v4 M17 19h4 M11 3l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z",
    layers: "m12 2 10 5-10 5L2 7l10-5Z m10 10-10 5L2 12 m20 5-10 5L2 17",
    columns: "M3 3h7v18H3z M14 3h7v18h-7z",
    flask: "M9 2v6.5L4 19a2 2 0 0 0 1.7 3h12.6A2 2 0 0 0 20 19l-5-10.5V2 M8 2h8 M7 14h10",
    bookmark: "m6 3 12 0v18l-6-4-6 4Z",
  };
  const d = paths[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {d && d.split(" M").map((seg, i) => <path key={i} d={(i === 0 ? seg : "M" + seg)} />)}
    </svg>
  );
};

window.Shell = Shell;
window.Icon = Icon;
