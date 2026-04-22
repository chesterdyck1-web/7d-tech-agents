"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApprovalCard } from "./components/ApprovalCard";
import { ConfirmationBanner } from "./components/ConfirmationBanner";

interface ApprovalData {
  approvalId: string;
  type: string;
  subject: string;
  body: string;
  toEmail: string;
  toName: string;
}

type PageState =
  | { status: "loading" }
  | { status: "ready"; data: ApprovalData }
  | { status: "error"; message: string }
  | { status: "done"; result: "approved" | "rejected" };

export default function ApprovePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "No approval token found in this link." });
      return;
    }

    fetch(`/api/approve?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: ApprovalData & { error?: string }) => {
        if (data.error) {
          setState({ status: "error", message: data.error });
        } else {
          setState({ status: "ready", data });
        }
      })
      .catch(() =>
        setState({ status: "error", message: "Unable to load approval. Try again." })
      );
  }, [token]);

  async function handleDecision(decision: "approve" | "reject") {
    setState({ status: "loading" });
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, decision }),
    });
    const data = (await res.json()) as { result?: string; error?: string };
    if (data.error) {
      setState({ status: "error", message: data.error });
    } else {
      setState({ status: "done", result: data.result as "approved" | "rejected" });
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <div style={styles.brand}>7D Tech</div>

        {state.status === "loading" && (
          <p style={styles.muted}>Loading...</p>
        )}

        {state.status === "error" && (
          <div style={styles.error}>
            <p>{state.message}</p>
          </div>
        )}

        {state.status === "ready" && (
          <ApprovalCard data={state.data} onDecision={handleDecision} />
        )}

        {state.status === "done" && (
          <ConfirmationBanner result={state.result} />
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    backgroundColor: "#faf9f7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Georgia', serif",
    padding: "2rem",
  },
  container: {
    width: "100%",
    maxWidth: "600px",
  },
  brand: {
    fontSize: "0.85rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: "#888",
    marginBottom: "2rem",
    textAlign: "center",
  },
  muted: {
    color: "#888",
    textAlign: "center",
  },
  error: {
    backgroundColor: "#fff3f3",
    border: "1px solid #fcc",
    borderRadius: "8px",
    padding: "1.5rem",
    color: "#c00",
    textAlign: "center",
  },
};
