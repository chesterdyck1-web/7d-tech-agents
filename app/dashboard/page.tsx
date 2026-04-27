"use client";

import { useEffect, useState, useCallback } from "react";

interface DashboardData {
  generatedAt: string;
  clients: { active: number; onboarding: number };
  pipeline: { todayLeads: number; pendingApprovals: number };
  financial: { mrr: number; profitabilityRatio: number; operatingFund: number; closeRate: number };
  agentHealth: { recentFailures: number; recentSuccesses: number };
  content: { pending: number; posted: number };
  recentActions: Array<{ timestamp: string; agent: string; action: string; status: string }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [secret, setSecret] = useState<string>("");
  const [authenticated, setAuthenticated] = useState(false);

  const fetchData = useCallback(async (s: string) => {
    try {
      const res = await fetch(`/api/dashboard/data?secret=${encodeURIComponent(s)}`);
      if (res.status === 401) {
        setError("Invalid access key.");
        setAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DashboardData;
      setData(json);
      setLastRefresh(new Date());
      setError(null);
      setAuthenticated(true);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  // Auto-refresh every 60 seconds when authenticated
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
      <main style={s.main}>
        <div style={s.loginBox}>
          <div style={s.crest}>⚜</div>
          <h1 style={s.title}>7D Tech Command</h1>
          <p style={s.subtitle}>Enter access key to proceed</p>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Access key"
              style={s.input}
              autoFocus
            />
            <button type="submit" style={s.button}>Enter</button>
          </form>
          {error && <p style={s.errorText}>{error}</p>}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={s.main}>
        <p style={s.muted}>Loading...</p>
      </main>
    );
  }

  const profitColor =
    data.financial.profitabilityRatio >= 2
      ? "#6fcf6f"
      : data.financial.profitabilityRatio >= 1
      ? "#c9a227"
      : "#e05c5c";

  const healthColor = data.agentHealth.recentFailures === 0 ? "#6fcf6f" : "#e05c5c";

  return (
    <main style={s.main}>
      <div style={s.page}>
        {/* Header */}
        <header style={s.header}>
          <span style={s.crestSmall}>⚜</span>
          <h1 style={s.headerTitle}>7D TECH COMMAND</h1>
          <span style={s.crestSmall}>⚜</span>
        </header>
        <div style={s.divider} />

        {/* Metrics Grid */}
        <div style={s.grid}>
          <MetricCard label="Monthly Revenue" value={`$${data.financial.mrr} CAD`} sub="MRR" />
          <MetricCard
            label="Profitability"
            value={`${data.financial.profitabilityRatio}×`}
            sub="target: 2×"
            valueColor={profitColor}
          />
          <MetricCard label="Active Clients" value={String(data.clients.active)} sub={data.clients.onboarding > 0 ? `+ ${data.clients.onboarding} onboarding` : "all active"} />
          <MetricCard label="Close Rate" value={`${data.financial.closeRate}%`} sub="this week" />
          <MetricCard label="Operating Fund" value={`$${data.financial.operatingFund} CAD`} sub="reserve" />
          <MetricCard label="Today's Leads" value={String(data.pipeline.todayLeads)} sub={`${data.pipeline.pendingApprovals} pending approval`} />
          <MetricCard
            label="Agent Health"
            value={data.agentHealth.recentFailures === 0 ? "All Clear" : `${data.agentHealth.recentFailures} failures`}
            sub="last 24 hours"
            valueColor={healthColor}
          />
          <MetricCard label="Content" value={String(data.content.posted)} sub={`${data.content.pending} pending approval`} />
        </div>

        <div style={s.divider} />

        {/* Activity Feed */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Recent Activity</h2>
          <div style={s.feed}>
            {data.recentActions.length === 0 && (
              <p style={s.muted}>No recent actions.</p>
            )}
            {data.recentActions.map((a, i) => (
              <div key={i} style={s.feedRow}>
                <span style={{ ...s.feedStatus, color: a.status === "failure" ? "#e05c5c" : "#6fcf6f" }}>
                  {a.status === "failure" ? "✕" : "✓"}
                </span>
                <span style={s.feedAgent}>{a.agent}</span>
                <span style={s.feedAction}>{a.action.replace(/_/g, " ")}</span>
                <span style={s.feedTime}>{a.timestamp ? new Date(a.timestamp).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
              </div>
            ))}
          </div>
        </section>

        <div style={s.divider} />

        <footer style={s.footer}>
          {lastRefresh && (
            <span>Last updated: {lastRefresh.toLocaleTimeString("en-CA")} — auto-refreshes every 60s</span>
          )}
        </footer>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div style={s.card}>
      <div style={s.cardLabel}>{label}</div>
      <div style={{ ...s.cardValue, color: valueColor ?? "#f5f0e8" }}>{value}</div>
      {sub && <div style={s.cardSub}>{sub}</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    backgroundColor: "#0f0e0d",
    color: "#f5f0e8",
    fontFamily: "'Georgia', serif",
    padding: "2rem 1rem",
  },
  page: {
    maxWidth: "900px",
    margin: "0 auto",
  },
  // Login
  loginBox: {
    maxWidth: "360px",
    margin: "10vh auto 0",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  crest: {
    fontSize: "2.5rem",
    color: "#c9a227",
  },
  title: {
    fontSize: "1.5rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#f5f0e8",
    margin: 0,
  },
  subtitle: {
    color: "#888",
    fontSize: "0.9rem",
    margin: 0,
  },
  input: {
    backgroundColor: "#1a1917",
    border: "1px solid #3a3632",
    borderRadius: "4px",
    color: "#f5f0e8",
    fontFamily: "'Georgia', serif",
    fontSize: "1rem",
    padding: "0.75rem 1rem",
    outline: "none",
  },
  button: {
    backgroundColor: "#c9a227",
    border: "none",
    borderRadius: "4px",
    color: "#0f0e0d",
    cursor: "pointer",
    fontFamily: "'Georgia', serif",
    fontSize: "1rem",
    fontWeight: "bold",
    letterSpacing: "0.08em",
    padding: "0.75rem 1.5rem",
    textTransform: "uppercase",
  },
  errorText: {
    color: "#e05c5c",
    fontSize: "0.85rem",
  },
  // Dashboard
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "1rem",
    paddingBottom: "1rem",
  },
  headerTitle: {
    fontSize: "1.4rem",
    letterSpacing: "0.18em",
    color: "#c9a227",
    margin: 0,
    fontWeight: "normal",
  },
  crestSmall: {
    fontSize: "1.2rem",
    color: "#c9a227",
    opacity: 0.7,
  },
  divider: {
    borderTop: "1px solid #3a3632",
    margin: "1.5rem 0",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "1rem",
  },
  card: {
    backgroundColor: "#1a1917",
    border: "1px solid #3a3632",
    borderRadius: "6px",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  cardLabel: {
    fontSize: "0.7rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#888",
  },
  cardValue: {
    fontSize: "1.8rem",
    color: "#f5f0e8",
    lineHeight: 1.1,
  },
  cardSub: {
    fontSize: "0.75rem",
    color: "#666",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  sectionTitle: {
    fontSize: "0.75rem",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#c9a227",
    margin: 0,
    fontWeight: "normal",
  },
  feed: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  feedRow: {
    display: "grid",
    gridTemplateColumns: "1.5rem 7rem 1fr 4rem",
    gap: "0.75rem",
    alignItems: "center",
    fontSize: "0.85rem",
    padding: "0.4rem 0",
    borderBottom: "1px solid #1e1d1b",
  },
  feedStatus: {
    textAlign: "center",
    fontWeight: "bold",
  },
  feedAgent: {
    color: "#c9a227",
    opacity: 0.9,
  },
  feedAction: {
    color: "#b8b0a4",
  },
  feedTime: {
    color: "#555",
    textAlign: "right",
    fontSize: "0.75rem",
  },
  footer: {
    textAlign: "center",
    fontSize: "0.7rem",
    color: "#444",
    paddingTop: "0.5rem",
  },
  muted: {
    color: "#555",
    textAlign: "center",
    fontSize: "0.9rem",
  },
};
