"use client";

import { useEffect, useState, useCallback } from "react";
import ApprovalsPanel from "./ApprovalsPanel";

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

interface DashboardData {
  generatedAt: string;
  clients: { active: number; onboarding: number };
  pipeline: { todayLeads: number; pendingApprovals: number };
  financial: { mrr: number; profitabilityRatio: number; operatingFund: number; closeRate: number };
  agentHealth: { recentFailures: number; recentSuccesses: number };
  content: { pending: number; posted: number };
  recentActions: Array<{ timestamp: string; agent: string; action: string; status: string }>;
  pendingApprovalsList: PendingApproval[];
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();

  const fetchData = useCallback(async (s: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/data?secret=${encodeURIComponent(s)}`);
      if (res.status === 401) {
        setError("Incorrect access key.");
        setAuthenticated(false);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const json = (await res.json()) as DashboardData;
      setData(json);
      setLastRefresh(new Date());
      setError(null);
      setAuthenticated(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated || !secret) return;
    const interval = setInterval(() => void fetchData(secret), 60_000);
    return () => clearInterval(interval);
  }, [authenticated, secret, fetchData]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    void fetchData(secret);
  }

  if (!authenticated) {
    return (
      <div style={s.root}>
        <div style={s.loginWrap}>
          <div style={s.loginCard}>
            <div style={s.loginCrest}>⚜</div>
            <div style={s.loginTitle}>7D TECH</div>
            <div style={s.loginSub}>Command Centre</div>
            <div style={s.loginRule} />
            <form onSubmit={handleLogin} style={s.loginForm}>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Access key"
                style={s.loginInput}
                autoFocus
              />
              <button type="submit" style={s.loginBtn} disabled={loading}>
                {loading ? "Verifying..." : "Enter"}
              </button>
            </form>
            {error && <div style={s.loginError}>{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={s.root}>
        <div style={s.centered}>Loading...</div>
      </div>
    );
  }

  const ratio = data.financial.profitabilityRatio;
  const ratioColor = ratio >= 2 ? "#5db87a" : ratio >= 1 ? "#c9a227" : "#d95f5f";
  const healthOk = data.agentHealth.recentFailures === 0;

  return (
    <div style={{ ...s.root, padding: isMobile ? "1.25rem 1rem" : "2.5rem 2rem" }}>
      {/* Header */}
      <header style={s.header}>
        <span style={s.headerCrest}>⚜</span>
        <span style={s.headerTitle}>7D TECH COMMAND</span>
        <span style={s.headerCrest}>⚜</span>
      </header>
      <div style={s.headerRule} />

      {/* Top metrics — financial row */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Financials</div>
        <div style={{ ...s.row4, gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)" }}>
          <Tile label="Monthly Revenue" value={`$${data.financial.mrr}`} unit="CAD" />
          <Tile label="Profitability" value={`${ratio}×`} unit="target 2×" accent={ratioColor} />
          <Tile label="Operating Fund" value={`$${data.financial.operatingFund}`} unit="CAD" />
          <Tile label="Close Rate" value={`${data.financial.closeRate}%`} unit="this week" />
        </div>
      </div>

      <div style={s.rule} />

      {/* Second row — operations */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Operations</div>
        <div style={{ ...s.row4, gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)" }}>
          <Tile label="Active Clients" value={String(data.clients.active)} unit={data.clients.onboarding > 0 ? `+${data.clients.onboarding} onboarding` : "all active"} />
          <Tile label="Pending Approvals" value={String(data.pipeline.pendingApprovals)} unit="awaiting your tap" accent={data.pipeline.pendingApprovals > 0 ? "#c9a227" : undefined} />
          <Tile label="Today's Leads" value={String(data.pipeline.todayLeads)} unit="new today" />
          <Tile label="Agent Health" value={healthOk ? "Clear" : `${data.agentHealth.recentFailures} err`} unit="last 24 h" accent={healthOk ? "#5db87a" : "#d95f5f"} />
        </div>
      </div>

      <div style={s.rule} />

      {/* Outreach approvals */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Outreach Approvals</div>
        <ApprovalsPanel
          secret={secret}
          pendingApprovals={data.pendingApprovalsList ?? []}
          onRefresh={() => void fetchData(secret)}
        />
      </div>

      <div style={s.rule} />

      {/* Activity feed */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Recent Activity</div>
        <div style={s.feed}>
          {data.recentActions.length === 0 && (
            <div style={s.feedEmpty}>No recent agent actions.</div>
          )}
          {data.recentActions.map((a, i) => (
            <div key={i} style={{
              ...s.feedRow,
              gridTemplateColumns: isMobile ? "1.5rem 1fr 3.5rem" : "1.5rem 7rem 1fr 4rem",
            }}>
              <span style={{ ...s.dot, background: a.status === "failure" ? "#d95f5f" : "#5db87a" }} />
              {!isMobile && <span style={s.feedAgent}>{a.agent}</span>}
              <span style={isMobile ? { ...s.feedAction, fontSize: "0.75rem" } : s.feedAction}>
                {isMobile ? `${a.agent}: ` : ""}{a.action.replace(/_/g, " ")}
              </span>
              <span style={s.feedTime}>
                {a.timestamp
                  ? new Date(a.timestamp).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })
                  : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={s.rule} />

      <footer style={s.footer}>
        {lastRefresh && <>Last updated {lastRefresh.toLocaleTimeString("en-CA")} · auto-refreshes every 60 s</>}
      </footer>
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}) {
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{label}</div>
      <div style={{ ...s.tileValue, color: accent ?? "#f5f0e8" }}>{value}</div>
      {unit && <div style={s.tileUnit}>{unit}</div>}
    </div>
  );
}

const GOLD = "#c9a227";
const CREAM = "#f5f0e8";
const BG = "#0f0e0d";
const SURFACE = "#161513";
const BORDER = "#2a2825";
const MUTED = "#665f57";

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    backgroundColor: BG,
    color: CREAM,
    fontFamily: "'Georgia', 'Times New Roman', serif",
    padding: "2.5rem 2rem",
    boxSizing: "border-box",
  },
  centered: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    color: MUTED,
  },

  // Login
  loginWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
  },
  loginCard: {
    width: "100%",
    maxWidth: "340px",
    backgroundColor: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: "2px",
    padding: "3rem 2.5rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.6rem",
  },
  loginCrest: {
    fontSize: "1.8rem",
    color: GOLD,
    marginBottom: "0.25rem",
  },
  loginTitle: {
    fontSize: "1rem",
    letterSpacing: "0.2em",
    color: CREAM,
  },
  loginSub: {
    fontSize: "0.7rem",
    letterSpacing: "0.14em",
    color: MUTED,
    textTransform: "uppercase" as const,
  },
  loginRule: {
    width: "2rem",
    height: "1px",
    backgroundColor: BORDER,
    margin: "1rem 0",
  },
  loginForm: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
    width: "100%",
  },
  loginInput: {
    backgroundColor: BG,
    border: `1px solid ${BORDER}`,
    borderRadius: "2px",
    color: CREAM,
    fontFamily: "'Georgia', serif",
    fontSize: "0.9rem",
    padding: "0.7rem 0.9rem",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  loginBtn: {
    backgroundColor: GOLD,
    border: "none",
    borderRadius: "2px",
    color: BG,
    cursor: "pointer",
    fontFamily: "'Georgia', serif",
    fontSize: "0.8rem",
    fontWeight: "bold" as const,
    letterSpacing: "0.12em",
    padding: "0.7rem",
    textTransform: "uppercase" as const,
    width: "100%",
  },
  loginError: {
    color: "#d95f5f",
    fontSize: "0.78rem",
    marginTop: "0.5rem",
    textAlign: "center" as const,
  },

  // Dashboard
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "1.25rem",
    marginBottom: "1.5rem",
  },
  headerCrest: {
    color: GOLD,
    fontSize: "1rem",
    opacity: 0.6,
  },
  headerTitle: {
    fontSize: "0.8rem",
    letterSpacing: "0.25em",
    color: CREAM,
  },
  headerRule: {
    borderTop: `1px solid ${BORDER}`,
    marginBottom: "2.5rem",
  },
  rule: {
    borderTop: `1px solid ${BORDER}`,
    margin: "2rem 0",
  },
  section: {
    marginBottom: "0.25rem",
  },
  sectionLabel: {
    fontSize: "0.65rem",
    letterSpacing: "0.16em",
    color: GOLD,
    textTransform: "uppercase" as const,
    marginBottom: "1rem",
    opacity: 0.8,
  },
  row4: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "1px",
    backgroundColor: BORDER,
    border: `1px solid ${BORDER}`,
  },
  tile: {
    backgroundColor: SURFACE,
    padding: "1.25rem 1.5rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.3rem",
  },
  tileLabel: {
    fontSize: "0.65rem",
    letterSpacing: "0.1em",
    color: MUTED,
    textTransform: "uppercase" as const,
  },
  tileValue: {
    fontSize: "2rem",
    lineHeight: 1,
    color: CREAM,
    fontWeight: "normal" as const,
  },
  tileUnit: {
    fontSize: "0.7rem",
    color: MUTED,
    marginTop: "0.15rem",
  },

  // Feed
  feed: {
    display: "flex",
    flexDirection: "column" as const,
    border: `1px solid ${BORDER}`,
  },
  feedEmpty: {
    padding: "1.25rem 1.5rem",
    color: MUTED,
    fontSize: "0.85rem",
  },
  feedRow: {
    display: "grid",
    gridTemplateColumns: "1.5rem 7rem 1fr 4rem",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.75rem 1rem",
    borderBottom: `1px solid ${BORDER}`,
    fontSize: "0.82rem",
  },
  dot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    display: "inline-block",
    flexShrink: 0,
  },
  feedAgent: {
    color: GOLD,
    opacity: 0.85,
    fontSize: "0.78rem",
    letterSpacing: "0.04em",
  },
  feedAction: {
    color: "#9a9088",
    fontSize: "0.82rem",
  },
  feedTime: {
    color: MUTED,
    fontSize: "0.72rem",
    textAlign: "right" as const,
  },
  footer: {
    textAlign: "center" as const,
    fontSize: "0.68rem",
    color: MUTED,
    marginTop: "0.5rem",
  },
};
