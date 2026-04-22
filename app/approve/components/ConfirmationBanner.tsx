"use client";

interface Props {
  result: "approved" | "rejected";
}

export function ConfirmationBanner({ result }: Props) {
  const approved = result === "approved";

  return (
    <div style={{ ...styles.banner, ...(approved ? styles.bannerApproved : styles.bannerRejected) }}>
      <div style={styles.icon}>{approved ? "✓" : "✕"}</div>
      <h2 style={styles.heading}>
        {approved ? "Sent." : "Rejected."}
      </h2>
      <p style={styles.sub}>
        {approved
          ? "The message has been sent. You can close this window."
          : "The message was discarded. You can close this window."}
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    borderRadius: "10px",
    padding: "2.5rem",
    textAlign: "center",
    border: "1px solid",
  },
  bannerApproved: {
    backgroundColor: "#f0faf4",
    borderColor: "#b7dfca",
    color: "#1a4731",
  },
  bannerRejected: {
    backgroundColor: "#faf0f0",
    borderColor: "#dfb7b7",
    color: "#471a1a",
  },
  icon: {
    fontSize: "2rem",
    marginBottom: "0.75rem",
  },
  heading: {
    fontSize: "1.4rem",
    fontWeight: "normal",
    margin: "0 0 0.5rem",
  },
  sub: {
    fontSize: "0.9rem",
    margin: 0,
    opacity: 0.75,
  },
};
