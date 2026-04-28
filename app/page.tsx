import FaqAccordion from "./components/FaqAccordion";

// ─── Colour tokens ───────────────────────────────────────────────────────────
const GOLD = "#c9963c";
const CREAM = "#f5f0e8";
const BG = "#1a1410";
const MAHOGANY = "#2d1f14";
const GREEN = "#2d4a2d";
const MUTED = "rgba(245, 240, 232, 0.65)";

// ─── Shared components ───────────────────────────────────────────────────────

function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", padding: "0.25rem 0" }}>
      <div style={{ flex: 1, height: "1px", background: `linear-gradient(to right, transparent, ${GOLD})`, opacity: 0.35 }} />
      <span style={{ color: GOLD, fontSize: "0.55rem", letterSpacing: "0.3em", opacity: 0.7 }}>◆ ◆ ◆</span>
      <div style={{ flex: 1, height: "1px", background: `linear-gradient(to left, transparent, ${GOLD})`, opacity: 0.35 }} />
    </div>
  );
}

function BtnFilled({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="btn-gold-filled"
      style={{
        display: "inline-block",
        backgroundColor: GOLD,
        color: BG,
        border: `2px solid ${GOLD}`,
        padding: "0.9rem 2.25rem",
        fontFamily: "var(--font-garamond), Georgia, serif",
        fontSize: "0.9rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase" as const,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </a>
  );
}

function BtnOutline({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="btn-gold-outline"
      style={{
        display: "inline-block",
        backgroundColor: "transparent",
        color: GOLD,
        border: `2px solid ${GOLD}`,
        padding: "0.9rem 2.25rem",
        fontFamily: "var(--font-garamond), Georgia, serif",
        fontSize: "0.9rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase" as const,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </a>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: "0.65rem",
      letterSpacing: "0.22em",
      textTransform: "uppercase" as const,
      color: GOLD,
      fontFamily: "var(--font-garamond), Georgia, serif",
      fontVariant: "small-caps",
      marginBottom: "1rem",
      opacity: 0.85,
    }}>
      {children}
    </p>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Home() {
  // Leather texture base applied to the root wrapper
  const leatherBg = {
    backgroundImage: "url('/leather.jpg')",
    backgroundRepeat: "repeat" as const,
    backgroundSize: "auto",
  };

  const sectionOverlay = (bg: string) => ({
    ...leatherBg,
    backgroundColor: bg,
    // Simulated leather overlay — background-color sits beneath background-image in CSS
    // so we stack them the correct way: solid color as a pseudo via gradient
    background: `linear-gradient(${bg}, ${bg}), url('/leather.jpg') repeat`,
  });

  return (
    <main style={{ backgroundColor: BG }}>

      {/* ── 1. NAVIGATION ── */}
      <nav style={{
        position: "sticky" as const,
        top: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1.1rem 3rem",
        background: `linear-gradient(rgba(26,20,16,0.97), rgba(26,20,16,0.97)), url('/leather.jpg') repeat`,
        borderBottom: `1px solid rgba(201, 150, 60, 0.2)`,
      }}>
        <span style={{
          fontFamily: "var(--font-playfair), Georgia, serif",
          fontSize: "1.1rem",
          letterSpacing: "0.08em",
          color: CREAM,
        }}>
          7D Tech
        </span>

        <div className="hide-mobile" style={{ display: "flex", alignItems: "center", gap: "2.5rem" }}>
          {["About", "How It Works", "Pricing", "FAQ"].map((l) => (
            <a
              key={l}
              href={`#${l.toLowerCase().replace(/ /g, "-")}`}
              className="nav-link-item"
              style={{
                fontSize: "0.72rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase" as const,
                color: MUTED,
                fontVariant: "small-caps",
              }}
            >
              {l}
            </a>
          ))}
        </div>

        <BtnFilled href="#book-demo">Book a Demo</BtnFilled>
      </nav>

      {/* ── 2. HERO ── */}
      <section style={{
        position: "relative" as const,
        minHeight: "92vh",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center" as const,
        padding: "6rem 2rem 4rem",
        backgroundImage: `linear-gradient(rgba(26,20,16,0.62), rgba(45,31,20,0.88)), url('/hero_image.jpg')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}>
        <SectionLabel>First Response Rx</SectionLabel>
        <h1 style={{
          fontFamily: "var(--font-playfair), Georgia, serif",
          fontSize: "clamp(2.6rem, 6vw, 5rem)",
          fontWeight: 700,
          color: CREAM,
          maxWidth: "820px",
          lineHeight: 1.1,
          marginBottom: "1.75rem",
        }}>
          The Right First Response.<br />Every Time.
        </h1>
        <p style={{
          fontFamily: "var(--font-garamond), Georgia, serif",
          fontSize: "clamp(1.05rem, 2vw, 1.3rem)",
          color: "rgba(245,240,232,0.85)",
          maxWidth: "600px",
          lineHeight: 1.75,
          marginBottom: "2.75rem",
        }}>
          When a prospect fills out your contact form, a personalized reply is drafted
          in 30&nbsp;seconds. You approve it with one tap. It sends.
        </p>
        <div className="hero-btns" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" as const, justifyContent: "center" }}>
          <BtnFilled href="#book-demo">Book a Demo</BtnFilled>
          <BtnOutline href="#apply">Apply for Beta</BtnOutline>
        </div>

        {/* Bottom ornamental divider */}
        <div style={{ position: "absolute" as const, bottom: "2rem", left: "10%", right: "10%" }}>
          <Divider />
        </div>
      </section>

      {/* ── 3. PROBLEM SECTION ── */}
      <section id="how-it-works" style={{ ...sectionOverlay(MAHOGANY), padding: "6rem 3rem" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5rem", alignItems: "center" }} className="grid-2col">
          <div>
            <SectionLabel>The Diagnosis</SectionLabel>
            <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", color: CREAM, marginBottom: "1.5rem", fontFamily: "var(--font-playfair), Georgia, serif" }}>
              Slow follow-up quietly costs service businesses real jobs.
            </h2>
            <p style={{ color: MUTED, fontSize: "1.05rem", lineHeight: 1.8, marginBottom: "1.25rem" }}>
              Leads are not lost because your work is poor. They are lost because a competitor
              replied first. A prospect contacts three businesses. The first to respond earns
              the booking. The other two never hear back.
            </p>
            <p style={{ color: MUTED, fontSize: "1.05rem", lineHeight: 1.8 }}>
              The average service business takes four to forty-eight hours to respond to a
              contact form. In that window, your prospect has moved on. First Response Rx
              closes that window permanently.
            </p>
          </div>
          <div style={{
            backgroundImage: "url('/apothecary.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            minHeight: "420px",
            border: `1px solid rgba(201,150,60,0.25)`,
            position: "relative" as const,
          }}>
            <div style={{
              position: "absolute" as const, inset: 0,
              background: "linear-gradient(135deg, rgba(45,31,20,0.5), transparent)",
            }} />
          </div>
        </div>
      </section>

      <div style={{ padding: "0 3rem" }}><Divider /></div>

      {/* ── 4. SOLUTION SECTION ── */}
      <section id="about" style={{ ...sectionOverlay(BG), padding: "6rem 3rem" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5rem", alignItems: "center" }} className="grid-2col">
          <div style={{
            backgroundImage: "url('/services.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            minHeight: "480px",
            border: `1px solid rgba(201,150,60,0.25)`,
            position: "relative" as const,
          }}>
            <div style={{
              position: "absolute" as const, inset: 0,
              background: "linear-gradient(135deg, transparent, rgba(26,20,16,0.4))",
            }} />
          </div>
          <div>
            <SectionLabel>The Prescription</SectionLabel>
            <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", color: CREAM, marginBottom: "0.5rem", fontFamily: "var(--font-playfair), Georgia, serif" }}>
              First Response Rx.
            </h2>
            <p style={{ color: GOLD, fontSize: "1rem", fontStyle: "italic", marginBottom: "1.5rem" }}>
              Personalized. Approved. Delivered in 30 seconds.
            </p>
            <p style={{ color: MUTED, fontSize: "1.05rem", lineHeight: 1.8, marginBottom: "1.25rem" }}>
              When someone fills out your contact form, a personalized reply is drafted for
              them immediately — specific to their name, their enquiry, and your business. Not
              a template. Not a generic acknowledgement. A reply that sounds like you wrote it.
            </p>
            <p style={{ color: MUTED, fontSize: "1.05rem", lineHeight: 1.8 }}>
              You review it on your phone with one tap. Approve and it sends from your email
              address. Reject and nothing goes out. You remain in complete control of every
              message — you simply never have to write the first one yourself again.
            </p>
          </div>
        </div>
      </section>

      <div style={{ padding: "0 3rem" }}><Divider /></div>

      {/* ── 5. HOW IT WORKS ── */}
      <section style={{ ...sectionOverlay(MAHOGANY), padding: "6rem 3rem" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ textAlign: "center" as const, marginBottom: "4rem" }}>
            <SectionLabel>The Process</SectionLabel>
            <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", color: CREAM, fontFamily: "var(--font-playfair), Georgia, serif" }}>
              Four steps. Thirty seconds.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1.5rem" }} className="grid-4col">
            {[
              { num: "I", icon: "✉", title: "Prospect submits your form", body: "A lead fills out the contact form on your website — any time of day, any day of the week." },
              { num: "II", icon: "⚗", title: "Reply drafted in 30 seconds", body: "A personalized reply is composed for that specific prospect — their name, their enquiry, your voice." },
              { num: "III", icon: "✦", title: "You approve with one tap", body: "A notification reaches your phone. Read the draft. Approve or dismiss — the choice is always yours." },
              { num: "IV", icon: "⚜", title: "Lead hears back immediately", body: "The reply sends from your email address. Your prospect feels heard before they have moved on." },
            ].map((step) => (
              <div
                key={step.num}
                className="panel-corners"
                style={{
                  backgroundColor: BG,
                  border: `1px solid rgba(201,150,60,0.3)`,
                  padding: "2rem 1.5rem",
                  position: "relative" as const,
                }}
              >
                <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: GOLD, marginBottom: "1rem", opacity: 0.6 }}>
                  {step.num}
                </div>
                <div style={{ fontSize: "1.6rem", color: GOLD, marginBottom: "1rem", opacity: 0.8 }}>
                  {step.icon}
                </div>
                <h3 style={{
                  fontFamily: "var(--font-playfair), Georgia, serif",
                  fontSize: "1rem",
                  color: CREAM,
                  marginBottom: "0.75rem",
                  lineHeight: 1.3,
                }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: "0.88rem", color: MUTED, lineHeight: 1.75 }}>
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ padding: "0 3rem" }}><Divider /></div>

      {/* ── 6. VALUE STACK ── */}
      <section id="pricing" style={{ ...sectionOverlay(BG), padding: "6rem 3rem" }}>
        <div style={{ maxWidth: "780px", margin: "0 auto" }}>
          <div style={{ textAlign: "center" as const, marginBottom: "3.5rem" }}>
            <SectionLabel>What Is Included</SectionLabel>
            <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", color: CREAM, fontFamily: "var(--font-playfair), Georgia, serif" }}>
              The complete prescription.
            </h2>
          </div>
          <div style={{
            border: `1px solid rgba(201,150,60,0.3)`,
            backgroundColor: MAHOGANY,
            padding: "3rem",
          }}>
            <p style={{ fontSize: "0.7rem", letterSpacing: "0.2em", color: GOLD, textTransform: "uppercase" as const, marginBottom: "2rem", borderBottom: `1px solid rgba(201,150,60,0.2)`, paddingBottom: "1rem" }}>
              Rx — First Response System
            </p>
            {[
              "Personalized reply drafted within 30 seconds of form submission",
              "One-tap approval — review and send from your phone, any time",
              "Replies sent from your own email address — no new inbox, no new software",
              "Works with any contact form on any website — no rebuild required",
              "Unlimited contact form submissions",
              "Dedicated onboarding — live in under one business day",
              "Founding member rate locked for life",
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "1rem",
                padding: "0.85rem 0",
                borderBottom: i < 6 ? `1px solid rgba(201,150,60,0.1)` : "none",
              }}>
                <span style={{ color: GOLD, fontSize: "0.7rem", paddingTop: "0.3rem", flexShrink: 0 }}>◆</span>
                <span style={{ color: CREAM, fontSize: "1rem", lineHeight: 1.6 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ padding: "0 3rem" }}><Divider /></div>

      {/* ── 7. PRICE ANCHORING ── */}
      <section style={{ ...sectionOverlay(MAHOGANY), padding: "6rem 3rem" }}>
        <div style={{ maxWidth: "820px", margin: "0 auto" }}>
          <div style={{ textAlign: "center" as const, marginBottom: "3.5rem" }}>
            <SectionLabel>The Ledger</SectionLabel>
            <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", color: CREAM, fontFamily: "var(--font-playfair), Georgia, serif", marginBottom: "1rem" }}>
              What does a slow reply actually cost?
            </h2>
            <p style={{ color: MUTED, fontSize: "1rem", lineHeight: 1.75 }}>
              Compare the true cost of your current approach against what you invest in First Response Rx.
            </p>
          </div>
          <table style={{
            width: "100%",
            borderCollapse: "collapse" as const,
            fontFamily: "var(--font-garamond), Georgia, serif",
            fontSize: "0.95rem",
          }}>
            <thead>
              <tr style={{ borderBottom: `2px solid rgba(201,150,60,0.4)` }}>
                <th style={{ textAlign: "left" as const, padding: "0.9rem 1rem", color: GOLD, fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase" as const, fontSize: "0.7rem" }}>Expense</th>
                <th style={{ textAlign: "right" as const, padding: "0.9rem 1rem", color: GOLD, fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase" as const, fontSize: "0.7rem" }}>Manual Approach</th>
                <th style={{ textAlign: "right" as const, padding: "0.9rem 1rem", color: GOLD, fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase" as const, fontSize: "0.7rem" }}>First Response Rx</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Response time", "4 – 48 hours", "30 seconds"],
                ["Leads lost to slow reply (est.)", "3 – 5 per month", "0"],
                ["Revenue lost (avg. job × lost leads)", "$1,500 – $5,000 /mo", "—"],
                ["Time spent writing replies", "30 – 60 min /week", "0"],
                ["Monthly cost of the solution", "Free (but costly)", "$50 CAD /mo"],
              ].map(([label, manual, rx], i) => (
                <tr key={i} style={{
                  borderBottom: `1px solid rgba(201,150,60,0.12)`,
                  backgroundColor: i % 2 === 0 ? "rgba(26,20,16,0.4)" : "transparent",
                }}>
                  <td style={{ padding: "1rem", color: MUTED }}>{label}</td>
                  <td style={{ padding: "1rem", textAlign: "right" as const, color: "rgba(200,100,80,0.9)" }}>{manual}</td>
                  <td style={{ padding: "1rem", textAlign: "right" as const, color: "#5db87a" }}>{rx}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div style={{ padding: "0 3rem" }}><Divider /></div>

      {/* ── 8. GUARANTEE ── */}
      <section style={{
        position: "relative" as const,
        padding: "7rem 3rem",
        textAlign: "center" as const,
        backgroundImage: `linear-gradient(rgba(26,20,16,0.78), rgba(26,20,16,0.88)), url('/trust_section.jpg')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}>
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          <SectionLabel>The Guarantee</SectionLabel>
          <div style={{ fontSize: "2.5rem", color: GOLD, marginBottom: "1.5rem", opacity: 0.8 }}>⚜</div>
          <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", color: CREAM, fontFamily: "var(--font-playfair), Georgia, serif", marginBottom: "1.5rem" }}>
            No-Risk Guarantee.
          </h2>
          <p style={{ color: MUTED, fontSize: "1.1rem", lineHeight: 1.85, marginBottom: "2.5rem" }}>
            If we cannot get your system live and sending personalized replies within
            30&nbsp;seconds of a form submission — you do not pay. We stand fully behind
            every prescription we write.
          </p>
          <BtnFilled href="#apply">Apply for Beta</BtnFilled>
        </div>
      </section>

      <div style={{ padding: "0 3rem" }}><Divider /></div>

      {/* ── 9. BETA ENROLLMENT ── */}
      <section id="apply" style={{ ...sectionOverlay(GREEN), padding: "6rem 3rem", textAlign: "center" as const }}>
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          <SectionLabel>Founding Beta — Now Open</SectionLabel>
          <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", color: CREAM, fontFamily: "var(--font-playfair), Georgia, serif", marginBottom: "1.25rem" }}>
            A limited number of founding practices are being admitted now.
          </h2>
          <p style={{ color: MUTED, fontSize: "1.05rem", lineHeight: 1.8, marginBottom: "3rem" }}>
            Beta members are onboarded personally. Each system is configured, tested, and
            verified live before you are charged a single dollar. Founding rates are locked
            for the life of your account — regardless of what the product charges new members
            in the future.
          </p>
          <div style={{ display: "flex", gap: "2rem", justifyContent: "center", flexWrap: "wrap" as const, marginBottom: "3rem" }}>
            <div style={{ border: `1px solid rgba(201,150,60,0.4)`, backgroundColor: "rgba(26,20,16,0.5)", padding: "2rem 2.5rem" }}>
              <div style={{ fontSize: "0.65rem", letterSpacing: "0.18em", color: GOLD, textTransform: "uppercase" as const, marginBottom: "0.5rem" }}>Annual — Best Value</div>
              <div style={{ fontSize: "2.4rem", color: CREAM, fontFamily: "var(--font-playfair), Georgia, serif", lineHeight: 1 }}>$480</div>
              <div style={{ fontSize: "0.8rem", color: MUTED, marginTop: "0.4rem" }}>CAD per year — $40/mo equivalent</div>
            </div>
            <div style={{ border: `1px solid rgba(201,150,60,0.2)`, backgroundColor: "rgba(26,20,16,0.3)", padding: "2rem 2.5rem" }}>
              <div style={{ fontSize: "0.65rem", letterSpacing: "0.18em", color: GOLD, textTransform: "uppercase" as const, marginBottom: "0.5rem" }}>Monthly</div>
              <div style={{ fontSize: "2.4rem", color: CREAM, fontFamily: "var(--font-playfair), Georgia, serif", lineHeight: 1 }}>$50</div>
              <div style={{ fontSize: "0.8rem", color: MUTED, marginTop: "0.4rem" }}>CAD per month</div>
            </div>
          </div>
          <BtnFilled href="#book-demo">Apply for Beta</BtnFilled>
        </div>
      </section>

      <div style={{ padding: "0 3rem" }}><Divider /></div>

      {/* ── 10. FAQ ── */}
      <section id="faq" style={{ ...sectionOverlay(BG), padding: "6rem 3rem" }}>
        <div style={{ maxWidth: "780px", margin: "0 auto" }}>
          <div style={{ textAlign: "center" as const, marginBottom: "3.5rem" }}>
            <SectionLabel>Common Questions</SectionLabel>
            <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", color: CREAM, fontFamily: "var(--font-playfair), Georgia, serif" }}>
              Frequently asked.
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>

      <div style={{ padding: "0 3rem" }}><Divider /></div>

      {/* ── 11. ABOUT ── */}
      <section style={{ ...sectionOverlay(MAHOGANY), padding: "6rem 3rem" }}>
        <div style={{ maxWidth: "780px", margin: "0 auto" }}>
          <SectionLabel>About 7D Tech</SectionLabel>
          <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", color: CREAM, fontFamily: "var(--font-playfair), Georgia, serif", marginBottom: "2rem" }}>
            The AI apothecary for service businesses.
          </h2>
          <p style={{ color: MUTED, fontSize: "1.05rem", lineHeight: 1.85, marginBottom: "1.5rem" }}>
            A good apothecary does not prescribe the same remedy to every patient. They
            listen first. They diagnose carefully. Then they compound a solution specific
            to the condition at hand.
          </p>
          <p style={{ color: MUTED, fontSize: "1.05rem", lineHeight: 1.85, marginBottom: "1.5rem" }}>
            7D Tech was built on the same principle. Every Canadian service business that
            walks through our door receives a system designed for their situation — not
            a package sold off a shelf.
          </p>
          <p style={{ color: MUTED, fontSize: "1.05rem", lineHeight: 1.85, marginBottom: "1.5rem" }}>
            First Response Rx is our flagship preparation. It solves one problem completely:
            the gap between when a prospect reaches out and when they hear back from you.
            We have narrowed that gap to thirty seconds. We guarantee it.
          </p>
          <p style={{ color: "rgba(201,150,60,0.85)", fontSize: "1.05rem", fontStyle: "italic", lineHeight: 1.85 }}>
            We diagnose before we prescribe. That is how good medicine works.
          </p>
        </div>
      </section>

      <div style={{ padding: "0 3rem" }}><Divider /></div>

      {/* ── 12. FINAL CTA ── */}
      <section id="book-demo" style={{
        position: "relative" as const,
        padding: "8rem 3rem",
        textAlign: "center" as const,
        backgroundImage: `linear-gradient(rgba(26,20,16,0.82), rgba(26,20,16,0.92)), url('/hero_image.jpg')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}>
        <div style={{ maxWidth: "660px", margin: "0 auto" }}>
          <div style={{ fontSize: "1.5rem", color: GOLD, marginBottom: "1.5rem", letterSpacing: "0.2em", opacity: 0.7 }}>⚜</div>
          <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 3.2rem)", color: CREAM, fontFamily: "var(--font-playfair), Georgia, serif", marginBottom: "1.5rem", lineHeight: 1.15 }}>
            Every lead deserves an immediate first response.
          </h2>
          <p style={{ color: MUTED, fontSize: "1.05rem", lineHeight: 1.8, marginBottom: "3rem" }}>
            Book a fifteen-minute demonstration. We will show you exactly how First Response
            Rx works, configured for your business, live — before you commit to anything.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" as const }}>
            <BtnFilled href="mailto:chester@7dtech.ca?subject=Book a Demo">Book a Demo</BtnFilled>
            <BtnOutline href="#apply">Apply for Beta</BtnOutline>
          </div>
        </div>
      </section>

      {/* ── 13. FOOTER ── */}
      <footer style={{
        background: `linear-gradient(rgba(10,8,6,0.97), rgba(10,8,6,0.97)), url('/leather.jpg') repeat`,
        borderTop: `1px solid rgba(201,150,60,0.2)`,
        padding: "4rem 3rem 3rem",
      }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "3rem", marginBottom: "3rem" }} className="grid-2col">
            <div>
              <div style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontSize: "1.2rem", color: CREAM, marginBottom: "0.75rem" }}>
                7D Tech
              </div>
              <p style={{ fontSize: "0.88rem", color: MUTED, lineHeight: 1.8, maxWidth: "340px" }}>
                The AI apothecary for Canadian service businesses. We diagnose before we prescribe.
              </p>
            </div>
            <div>
              <p style={{ fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase" as const, color: GOLD, marginBottom: "1rem", opacity: 0.7 }}>Navigation</p>
              {["How It Works", "Pricing", "FAQ", "About"].map((l) => (
                <div key={l} style={{ marginBottom: "0.5rem" }}>
                  <a href={`#${l.toLowerCase().replace(/ /g, "-")}`} className="nav-link-item" style={{ fontSize: "0.9rem", color: MUTED }}>
                    {l}
                  </a>
                </div>
              ))}
            </div>
            <div>
              <p style={{ fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase" as const, color: GOLD, marginBottom: "1rem", opacity: 0.7 }}>Contact</p>
              <div style={{ marginBottom: "0.5rem" }}>
                <a href="mailto:chester@7dtech.ca" className="nav-link-item" style={{ fontSize: "0.9rem", color: MUTED }}>
                  chester@7dtech.ca
                </a>
              </div>
              <div style={{ marginBottom: "0.5rem" }}>
                <a href="#book-demo" className="nav-link-item" style={{ fontSize: "0.9rem", color: MUTED }}>
                  Book a Demo
                </a>
              </div>
              <div>
                <a href="#apply" className="nav-link-item" style={{ fontSize: "0.9rem", color: MUTED }}>
                  Apply for Beta
                </a>
              </div>
            </div>
          </div>
          <Divider />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "2rem", flexWrap: "wrap" as const, gap: "1rem" }}>
            <p style={{ fontSize: "0.72rem", color: "rgba(245,240,232,0.3)" }}>
              © 2026 7D Tech — All rights reserved
            </p>
            <div style={{ display: "flex", gap: "2rem" }}>
              <a href="/privacy" className="nav-link-item" style={{ fontSize: "0.72rem", color: "rgba(245,240,232,0.3)" }}>Privacy Policy</a>
              <a href="/terms" className="nav-link-item" style={{ fontSize: "0.72rem", color: "rgba(245,240,232,0.3)" }}>Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>

    </main>
  );
}
