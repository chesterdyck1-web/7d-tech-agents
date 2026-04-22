// Maps Chester's Telegram messages to intent strings.
// Claude classifies the intent, then this file routes to the right handler.

export type Intent =
  | "view_pipeline"
  | "view_approvals"
  | "onboard_client"
  | "run_audit"
  | "send_prescription"
  | "build_spec"
  | "run_prospecting"
  | "content_status"
  | "view_performance"
  | "get_summary"
  | "ask_question";

// Keyword-based fast-path router — avoids a Claude call for common commands.
export function fastRouteIntent(text: string): Intent | null {
  const t = text.toLowerCase().trim();

  if (t.includes("show pipeline") || t.includes("leads today")) return "view_pipeline";
  if (t.includes("pending approval")) return "view_approvals";
  if (t.startsWith("client signed")) return "onboard_client";
  if (t.startsWith("audit ")) return "run_audit";
  if (t.startsWith("send prescription for")) return "send_prescription";
  if (t.startsWith("build ")) return "build_spec";
  if (t.includes("run prospecting")) return "run_prospecting";
  if (t.includes("content status")) return "content_status";
  if (t === "performance" || t.includes("how are agents doing")) return "view_performance";
  if (t === "daily brief") return "get_summary";

  return null; // Fall through to Claude classification
}
