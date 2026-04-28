"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "Is this a chatbot?",
    a: "No. First Response Rx is not a chatbot and does not interact with your prospects directly. It drafts a personalized reply for you to review and approve. You remain in complete control of every word that leaves your business.",
  },
  {
    q: "Will this work with our current website?",
    a: "Yes. First Response Rx works with any contact form on any website — WordPress, Squarespace, Wix, custom-built, or anything else. If it receives a contact form submission, it works. No changes to your website are required.",
  },
  {
    q: "Will replies sound robotic?",
    a: "No. Every reply is written specifically for that prospect, referencing what they asked, their name, and their business context. Your clients will not be able to distinguish it from something you wrote yourself. That is the entire point.",
  },
  {
    q: "What happens after the beta?",
    a: "Beta members lock in their rate permanently — $50 per month or $480 per year, never subject to price increases. As the product matures and the price rises for new members, yours stays fixed. You are recognized as a founding member.",
  },
  {
    q: "Is $50 per month worth it?",
    a: "A single booked job from a lead that would otherwise have gone cold covers the subscription many times over. For most service businesses, recapturing one lost lead per month more than pays for a year of First Response Rx.",
  },
];

const GOLD = "#c9963c";
const CREAM = "#f5f0e8";
const BG = "#1a1410";
const MAHOGANY = "#2d1f14";

export default function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {FAQS.map((faq, i) => (
        <div
          key={i}
          className="faq-item"
          style={{
            border: `1px solid rgba(201, 150, 60, 0.2)`,
            borderTop: i === 0 ? `1px solid rgba(201, 150, 60, 0.2)` : "none",
            backgroundColor: open === i ? MAHOGANY : BG,
          }}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1.5rem 2rem",
              background: "none",
              border: "none",
              color: CREAM,
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontSize: "1.05rem",
              textAlign: "left" as const,
              cursor: "pointer",
              gap: "1rem",
            }}
          >
            <span>{faq.q}</span>
            <span
              style={{
                color: GOLD,
                fontSize: "1.2rem",
                flexShrink: 0,
                transform: open === i ? "rotate(45deg)" : "none",
                transition: "transform 0.2s ease",
                lineHeight: 1,
              }}
            >
              ✦
            </span>
          </button>
          {open === i && (
            <div
              style={{
                padding: "0 2rem 1.75rem",
                color: "rgba(245, 240, 232, 0.8)",
                fontFamily: "var(--font-garamond), Georgia, serif",
                fontSize: "1rem",
                lineHeight: 1.75,
                borderTop: `1px solid rgba(201, 150, 60, 0.15)`,
                paddingTop: "1.25rem",
              }}
            >
              {faq.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
