import { ContactForm } from "./components/ContactForm";

export default function Home() {
  return (
    <main>
      {/* Header */}
      <header style={s.header}>
        <span style={s.logo}>7D Tech</span>
        <nav style={s.nav}>
          <a href="#demo" style={s.navLink}>Book a Demo</a>
          <a href="#demo" style={s.navCta}>Apply for Beta</a>
        </nav>
      </header>

      {/* Hero */}
      <section style={s.hero}>
        <div style={s.heroInner}>
          <p style={s.eyebrow}>First Response Rx</p>
          <h1 style={s.headline}>The right first response,<br />every time.</h1>
          <p style={s.subhead}>
            When a prospect fills out your contact form, a personalized reply
            is drafted in 30&nbsp;seconds. You approve it with one tap. It sends.
          </p>
          <div style={s.heroCtas}>
            <a href="#demo" style={s.btnPrimary}>Book a Demo</a>
            <a href="#demo" style={s.btnSecondary}>Apply for Beta</a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={s.section}>
        <div style={s.inner}>
          <h2 style={s.sectionHeading}>The diagnosis</h2>
          <p style={s.sectionSub}>
            Service businesses lose leads every day — not because they do not care,
            but because they are busy doing the work. A prospect contacts three businesses.
            The first to reply wins the booking. The other two never hear back.
          </p>
          <div style={s.steps}>
            {[
              ["1.", "A prospect fills out your contact form."],
              ["2.", "A hyper-personalized reply is drafted in 30 seconds."],
              ["3.", "You review it and approve with one tap."],
              ["4.", "The reply sends from your email address. The lead is warm."],
            ].map(([num, text]) => (
              <div key={num} style={s.step}>
                <span style={s.stepNum}>{num}</span>
                <span style={s.stepText}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Proof points */}
      <section style={{ ...s.section, backgroundColor: "#f0ebe3" }}>
        <div style={s.inner}>
          <h2 style={s.sectionHeading}>The prescription</h2>
          <div style={s.pillars}>
            {[
              ["Human in the loop", "Every reply requires your approval before it sends. You stay in control — always."],
              ["Hyper-personalized", "Each reply is written for that specific person, referencing what they asked. Not a template."],
              ["Reply in 30 seconds", "The draft is ready before the prospect has closed the tab. You are always first."],
            ].map(([title, body]) => (
              <div key={title} style={s.pillar}>
                <h3 style={s.pillarTitle}>{title}</h3>
                <p style={s.pillarBody}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo form */}
      <section id="demo" style={s.section}>
        <div style={{ ...s.inner, maxWidth: "540px" }}>
          <h2 style={s.sectionHeading}>See it live</h2>
          <p style={s.sectionSub}>
            Fill out the form below. Within 30 seconds, Chester will receive a
            personalized draft reply for your inquiry — and approve it with one tap.
            Watch your inbox.
          </p>
          <ContactForm />
        </div>
      </section>

      {/* Footer */}
      <footer style={s.footer}>
        <p>© 2026 7D Tech — 7dtech.ca</p>
      </footer>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1.25rem 2rem",
    borderBottom: "1px solid #e8e3dc",
    backgroundColor: "#faf9f7",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  logo: {
    fontSize: "0.85rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: "#555",
  },
  nav: { display: "flex", alignItems: "center", gap: "1.5rem" },
  navLink: { fontSize: "0.9rem", color: "#555" },
  navCta: {
    fontSize: "0.85rem",
    backgroundColor: "#1a1a1a",
    color: "#fff",
    padding: "0.5rem 1.1rem",
    borderRadius: "5px",
    letterSpacing: "0.04em",
  },
  hero: {
    padding: "6rem 2rem 5rem",
    textAlign: "center",
  },
  heroInner: { maxWidth: "680px", margin: "0 auto" },
  eyebrow: {
    fontSize: "0.75rem",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "#999",
    marginBottom: "1.25rem",
  },
  headline: {
    fontSize: "clamp(2rem, 5vw, 3.25rem)",
    fontWeight: "normal",
    lineHeight: 1.15,
    marginBottom: "1.5rem",
    color: "#1a1a1a",
  },
  subhead: {
    fontSize: "1.1rem",
    color: "#555",
    maxWidth: "500px",
    margin: "0 auto 2.5rem",
    lineHeight: 1.7,
  },
  heroCtas: { display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" },
  btnPrimary: {
    backgroundColor: "#1a1a1a",
    color: "#fff",
    padding: "0.85rem 2rem",
    borderRadius: "5px",
    fontSize: "0.95rem",
    letterSpacing: "0.04em",
  },
  btnSecondary: {
    backgroundColor: "transparent",
    color: "#1a1a1a",
    padding: "0.85rem 2rem",
    borderRadius: "5px",
    fontSize: "0.95rem",
    border: "1px solid #ccc",
  },
  section: { padding: "5rem 2rem" },
  inner: { maxWidth: "760px", margin: "0 auto" },
  sectionHeading: {
    fontSize: "1.6rem",
    fontWeight: "normal",
    marginBottom: "1rem",
    color: "#1a1a1a",
  },
  sectionSub: {
    fontSize: "1rem",
    color: "#555",
    lineHeight: 1.75,
    marginBottom: "2.5rem",
  },
  steps: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  step: { display: "flex", gap: "1rem", alignItems: "flex-start" },
  stepNum: {
    fontSize: "0.85rem",
    color: "#aaa",
    minWidth: "1.5rem",
    paddingTop: "0.1rem",
  },
  stepText: { fontSize: "1rem", color: "#333", lineHeight: 1.6 },
  pillars: { display: "flex", gap: "2rem", flexWrap: "wrap" },
  pillar: { flex: "1 1 200px" },
  pillarTitle: {
    fontSize: "1rem",
    fontWeight: "normal",
    marginBottom: "0.5rem",
    color: "#1a1a1a",
    fontStyle: "italic",
  },
  pillarBody: { fontSize: "0.9rem", color: "#555", lineHeight: 1.65 },
  footer: {
    borderTop: "1px solid #e8e3dc",
    padding: "2rem",
    textAlign: "center",
    fontSize: "0.8rem",
    color: "#aaa",
  },
};
