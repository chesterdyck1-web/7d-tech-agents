"use client";

import { useState } from "react";

interface ApprovalData {
  approvalId: string;
  type: string;
  subject: string;
  body: string;
  toEmail: string;
  toName: string;
}

interface Props {
  data: ApprovalData;
  onDecision: (decision: "approve" | "reject") => Promise<void>;
}

export function ApprovalCard({ data, onDecision }: Props) {
  const [confirming, setConfirming] = useState(false);

  const typeLabel: Record<string, string> = {
    outreach_email: "Cold outreach email",
    client_response: "Client reply",
    builder_deploy: "Builder deploy",
    social_post: "Social post",
  };

  return (
    <div style={styles.card}>
      <div style={styles.typeTag}>{typeLabel[data.type] ?? data.type}</div>

      <h2 style={styles.subject}>{data.subject}</h2>

      <div style={styles.meta}>
        To: <strong>{data.toName}</strong> &lt;{data.toEmail}&gt;
      </div>

      <div style={styles.bodyBox}>
        {data.body.split("\n").map((line, i) => (
          <p key={i} style={styles.bodyLine}>{line}</p>
        ))}
      </div>

      <div style={styles.actions}>
        <button
          style={{ ...styles.btn, ...styles.btnApprove }}
          onClick={() => { setConfirming(true); onDecision("approve"); }}
          disabled={confirming}
        >
          Approve — Send
        </button>
        <button
          style={{ ...styles.btn, ...styles.btnReject }}
          onClick={() => { setConfirming(true); onDecision("reject"); }}
          disabled={confirming}
        >
          Reject
        </button>
      </div>

      <p style={styles.hint}>
        This link is single-use and expires in 24 hours.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: "#fff",
    border: "1px solid #e8e3dc",
    borderRadius: "10px",
    padding: "2rem",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  },
  typeTag: {
    display: "inline-block",
    fontSize: "0.7rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    backgroundColor: "#f0ebe3",
    color: "#7a6a55",
    borderRadius: "4px",
    padding: "0.25rem 0.6rem",
    marginBottom: "1rem",
  },
  subject: {
    fontSize: "1.2rem",
    fontWeight: "normal",
    color: "#1a1a1a",
    margin: "0 0 0.75rem",
  },
  meta: {
    fontSize: "0.85rem",
    color: "#666",
    marginBottom: "1.25rem",
  },
  bodyBox: {
    backgroundColor: "#faf9f7",
    border: "1px solid #e8e3dc",
    borderRadius: "6px",
    padding: "1.25rem",
    marginBottom: "1.5rem",
    maxHeight: "280px",
    overflowY: "auto",
  },
  bodyLine: {
    margin: "0 0 0.5rem",
    fontSize: "0.95rem",
    color: "#333",
    lineHeight: "1.6",
  },
  actions: {
    display: "flex",
    gap: "0.75rem",
    marginBottom: "1rem",
  },
  btn: {
    flex: 1,
    padding: "0.85rem",
    fontSize: "0.95rem",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.03em",
  },
  btnApprove: {
    backgroundColor: "#2d6a4f",
    color: "#fff",
  },
  btnReject: {
    backgroundColor: "#f0ebe3",
    color: "#555",
  },
  hint: {
    fontSize: "0.75rem",
    color: "#aaa",
    textAlign: "center",
    margin: 0,
  },
};
