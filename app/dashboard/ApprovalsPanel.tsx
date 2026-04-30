"use client";

import { useEffect, useState } from "react";

interface PendingApproval {
  approvalId: string;
  type: string;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  qaStatus: string;
  createdAt: string;
}

interface Props {
  secret: string;
  pendingApprovals: PendingApproval[];
  onRefresh: () => void;
}

const GOLD = "#c9a227";
const CREAM = "#f5f0e8";
const BG = "#0f0e0d";
const SURFACE = "#161513";
const BORDER = "#2a2825";
const MUTED = "#665f57";
const GREEN = "#5db87a";
const RED = "#d95f5f";

export default function ApprovalsPanel({ secret, pendingApprovals, onRefresh }: Props) {
  const [autonomous, setAutonomous] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; msg: string } | null>(null);

  useEffect(() => {
    void fetch(`/api/dashboard/settings?secret=${encodeURIComponent(secret)}`)
      .then((r) => r.json())
      .then((d: { autonomousOutreach: boolean }) => setAutonomous(d.autonomousOutreach))
      .catch(() => setAutonomous(false));
  }, [secret]);

  async function toggleAutonomous() {
    if (autonomous === null) return;
    setToggling(true);
    try {
      await fetch("/api/dashboard/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, autonomousOutreach: !autonomous }),
      });
      setAutonomous(!autonomous);
      onRefresh();
    } finally {
      setToggling(false);
    }
  }

  async function decide(approvalId: string, decision: "approve" | "reject") {
    setActioning(approvalId);
    try {
      const res = await fetch("/api/dashboard/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, decision, secret }),
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (data.error) {
        setFeedback({ id: approvalId, msg: data.error });
      } else {
        setFeedback({ id: approvalId, msg: decision === "approve" ? "Sent." : "Rejected." });
        setTimeout(() => {
          setFeedback(null);
          onRefresh();
        }, 1200);
      }
    } finally {
      setActioning(null);
    }
  }

  return (
    <div>
      {/* Autonomous mode toggle */}
      <div style={s.autonomousRow}>
        <div>
          <div style={s.autoLabel}>Autonomous Outreach</div>
          <div style={s.autoSub}>
            {autonomous
              ? "Emails send automatically without your approval."
              : "Every email waits for your one-tap approval."}
          </div>
        </div>
        <button
          onClick={() => void toggleAutonomous()}
          disabled={toggling || autonomous === null}
          style={{
            ...s.toggleBtn,
            backgroundColor: autonomous ? GREEN : BORDER,
            color: autonomous ? BG : MUTED,
          }}
        >
          {toggling ? "..." : autonomous ? "ON" : "OFF"}
        </button>
      </div>

      {/* Pending list */}
      {!autonomous && (
        <div style={s.list}>
          {pendingApprovals.length === 0 ? (
            <div style={s.empty}>No pending outreach approvals.</div>
          ) : (
            pendingApprovals.map((a) => {
              const isExpanded = expanded === a.approvalId;
              const isBusy = actioning === a.approvalId;
              const fb = feedback?.id === a.approvalId ? feedback.msg : null;

              return (
                <div key={a.approvalId} style={s.card}>
                  <div style={s.cardHeader} onClick={() => setExpanded(isExpanded ? null : a.approvalId)}>
                    <div style={s.cardMeta}>
                      <span style={s.cardName}>{a.toName || a.toEmail}</span>
                      <span style={s.cardSubject}>{a.subject}</span>
                    </div>
                    <div style={s.cardRight}>
                      {a.qaStatus === "failed" && (
                        <span style={s.qaFailed}>QA ✗</span>
                      )}
                      <span style={{ ...s.chevron, transform: isExpanded ? "rotate(90deg)" : "none" }}>›</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={s.cardBody}>
                      <div style={s.toLine}>
                        <span style={s.toLabel}>To</span>
                        <span style={s.toVal}>{a.toName} &lt;{a.toEmail}&gt;</span>
                      </div>
                      <div style={s.emailBody}>{a.body}</div>

                      {fb ? (
                        <div style={{ ...s.fbMsg, color: fb === "Sent." ? GREEN : fb === "Rejected." ? MUTED : RED }}>
                          {fb}
                        </div>
                      ) : (
                        <div style={s.actions}>
                          <button
                            onClick={() => void decide(a.approvalId, "approve")}
                            disabled={isBusy}
                            style={{ ...s.btn, ...s.btnApprove }}
                          >
                            {isBusy ? "..." : "Approve — Send"}
                          </button>
                          <button
                            onClick={() => void decide(a.approvalId, "reject")}
                            disabled={isBusy}
                            style={{ ...s.btn, ...s.btnReject }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  autonomousRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    padding: "1.25rem 1.5rem",
    backgroundColor: SURFACE,
    border: `1px solid ${BORDER}`,
    marginBottom: "1px",
  },
  autoLabel: {
    fontSize: "0.78rem",
    letterSpacing: "0.08em",
    color: CREAM,
    marginBottom: "0.2rem",
  },
  autoSub: {
    fontSize: "0.68rem",
    color: MUTED,
  },
  toggleBtn: {
    border: "none",
    borderRadius: "2px",
    cursor: "pointer",
    fontFamily: "'Georgia', serif",
    fontSize: "0.7rem",
    fontWeight: "bold",
    letterSpacing: "0.12em",
    padding: "0.5rem 1.1rem",
    flexShrink: 0,
    transition: "background 0.2s ease",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  },
  empty: {
    padding: "1.25rem 1.5rem",
    backgroundColor: SURFACE,
    border: `1px solid ${BORDER}`,
    color: MUTED,
    fontSize: "0.85rem",
  },
  card: {
    backgroundColor: SURFACE,
    border: `1px solid ${BORDER}`,
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1rem 1.5rem",
    cursor: "pointer",
    gap: "1rem",
  },
  cardMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
    minWidth: 0,
  },
  cardName: {
    color: GOLD,
    fontSize: "0.82rem",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cardSubject: {
    color: "rgba(245,240,232,0.65)",
    fontSize: "0.75rem",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cardRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    flexShrink: 0,
  },
  qaFailed: {
    fontSize: "0.65rem",
    color: RED,
    letterSpacing: "0.06em",
  },
  chevron: {
    color: MUTED,
    fontSize: "1.1rem",
    display: "inline-block",
    transition: "transform 0.15s ease",
  },
  cardBody: {
    padding: "0 1.5rem 1.25rem",
    borderTop: `1px solid ${BORDER}`,
    paddingTop: "1rem",
  },
  toLine: {
    display: "flex",
    gap: "0.6rem",
    alignItems: "baseline",
    marginBottom: "0.75rem",
  },
  toLabel: {
    fontSize: "0.65rem",
    letterSpacing: "0.1em",
    color: MUTED,
    textTransform: "uppercase" as const,
    flexShrink: 0,
  },
  toVal: {
    fontSize: "0.78rem",
    color: "rgba(245,240,232,0.75)",
  },
  emailBody: {
    backgroundColor: BG,
    border: `1px solid ${BORDER}`,
    padding: "1rem",
    fontSize: "0.82rem",
    lineHeight: 1.7,
    color: "rgba(245,240,232,0.8)",
    whiteSpace: "pre-wrap",
    maxHeight: "200px",
    overflowY: "auto",
    marginBottom: "1rem",
    fontFamily: "'Georgia', serif",
  },
  actions: {
    display: "flex",
    gap: "0.75rem",
  },
  btn: {
    border: "none",
    borderRadius: "2px",
    cursor: "pointer",
    fontFamily: "'Georgia', serif",
    fontSize: "0.75rem",
    letterSpacing: "0.1em",
    padding: "0.6rem 1.25rem",
  },
  btnApprove: {
    backgroundColor: GREEN,
    color: BG,
    fontWeight: "bold",
  },
  btnReject: {
    backgroundColor: "transparent",
    color: MUTED,
    border: `1px solid ${BORDER}`,
  },
  fbMsg: {
    fontSize: "0.8rem",
    letterSpacing: "0.06em",
    padding: "0.5rem 0",
  },
};
