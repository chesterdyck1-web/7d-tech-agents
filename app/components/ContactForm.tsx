"use client";

import { useState } from "react";

type State = "idle" | "submitting" | "done" | "error";

export function ContactForm() {
  const [state, setState] = useState<State>("idle");
  const [fields, setFields] = useState({
    name: "",
    email: "",
    business: "",
    message: "",
  });

  function update(field: keyof typeof fields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFields((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    try {
      const res = await fetch("/api/webhooks/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("Request failed");
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div style={s.success}>
        <p style={s.successTitle}>Inquiry received.</p>
        <p style={s.successSub}>
          A personalized reply is being drafted now. Check your inbox — it will
          arrive within 30 seconds of Chester's approval.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={s.form}>
      <div style={s.row}>
        <label style={s.label}>Your name</label>
        <input
          style={s.input}
          type="text"
          required
          placeholder="Jane Smith"
          value={fields.name}
          onChange={update("name")}
        />
      </div>
      <div style={s.row}>
        <label style={s.label}>Email address</label>
        <input
          style={s.input}
          type="email"
          required
          placeholder="jane@yourgyml.ca"
          value={fields.email}
          onChange={update("email")}
        />
      </div>
      <div style={s.row}>
        <label style={s.label}>Business name</label>
        <input
          style={s.input}
          type="text"
          required
          placeholder="CrossFit YYC"
          value={fields.business}
          onChange={update("business")}
        />
      </div>
      <div style={s.row}>
        <label style={s.label}>What are you looking to solve?</label>
        <textarea
          style={s.textarea}
          required
          rows={4}
          placeholder="We get a lot of contact form inquiries but struggle to respond quickly enough..."
          value={fields.message}
          onChange={update("message")}
        />
      </div>

      {state === "error" && (
        <p style={s.errorMsg}>Something went wrong. Please try again.</p>
      )}

      <button type="submit" style={s.submit} disabled={state === "submitting"}>
        {state === "submitting" ? "Sending..." : "Submit inquiry"}
      </button>
    </form>
  );
}

const s: Record<string, React.CSSProperties> = {
  form: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  row: { display: "flex", flexDirection: "column", gap: "0.4rem" },
  label: { fontSize: "0.85rem", color: "#555", letterSpacing: "0.02em" },
  input: {
    padding: "0.75rem 1rem",
    border: "1px solid #d8d3cc",
    borderRadius: "5px",
    fontSize: "1rem",
    backgroundColor: "#fff",
    fontFamily: "inherit",
    outline: "none",
  },
  textarea: {
    padding: "0.75rem 1rem",
    border: "1px solid #d8d3cc",
    borderRadius: "5px",
    fontSize: "1rem",
    backgroundColor: "#fff",
    fontFamily: "inherit",
    resize: "vertical",
    outline: "none",
  },
  submit: {
    backgroundColor: "#1a1a1a",
    color: "#fff",
    padding: "0.9rem",
    border: "none",
    borderRadius: "5px",
    fontSize: "0.95rem",
    letterSpacing: "0.04em",
    marginTop: "0.5rem",
  },
  errorMsg: { color: "#c00", fontSize: "0.85rem" },
  success: {
    backgroundColor: "#f0faf4",
    border: "1px solid #b7dfca",
    borderRadius: "8px",
    padding: "2rem",
    textAlign: "center",
  },
  successTitle: {
    fontSize: "1.2rem",
    color: "#1a4731",
    marginBottom: "0.75rem",
  },
  successSub: { fontSize: "0.95rem", color: "#2d6a4f", lineHeight: 1.65 },
};
