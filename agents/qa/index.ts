// QA Agent (Quinn) — orchestrates all quality checks.
// Phase 2: email validation. Phase 4: full suite added.
// Nothing goes live without Quinn's sign-off.

export { runEmailQA } from "./email-tester";
export type { QAResult } from "./email-tester";

import { runEmailQA } from "./email-tester";
import { runAutomationTest } from "./automation-tester";
import { runOutputReview } from "./output-reviewer";
import { runStressTest } from "./stress-tester";
import type { DraftedEmail } from "@/agents/outreach/email-drafter";

export { runAutomationTest } from "./automation-tester";
export { runOutputReview } from "./output-reviewer";
export { runStressTest } from "./stress-tester";

export interface ModuleResult {
  passed: boolean;
  reasons: string[];
}

export interface FullQAResult {
  passed: boolean;
  modules: {
    email?: ModuleResult;
    automation: ModuleResult;
    outputReview?: ModuleResult;
    stressTest: ModuleResult;
  };
  // Flat list of all failure reasons across all modules, prefixed with which module failed
  allReasons: string[];
}

export interface FullQAOptions {
  emailDraft?: DraftedEmail;     // pass to run email QA
  outputText?: string;            // pass to run output review
  outputLabel?: string;           // label for output review error messages (e.g. "intel brief")
  clientId?: string;              // pass to include client-specific webhook tests
}

// Run all applicable QA modules and return a single unified verdict.
// Always runs automation + stress. Email and output review are opt-in via options.
export async function runFullQA(options: FullQAOptions = {}): Promise<FullQAResult> {
  const { emailDraft, outputText, outputLabel = "output", clientId } = options;

  const [automationResult, stressResult] = await Promise.all([
    runAutomationTest(clientId),
    runStressTest(clientId),
  ]);

  const modules: FullQAResult["modules"] = {
    automation: automationResult,
    stressTest: stressResult,
  };

  if (emailDraft) {
    modules.email = await runEmailQA(emailDraft);
  }

  if (outputText) {
    modules.outputReview = runOutputReview(outputText, outputLabel);
  }

  const allReasons: string[] = [
    ...(modules.email?.reasons ?? []).map((r) => `[email] ${r}`),
    ...automationResult.reasons.map((r) => `[automation] ${r}`),
    ...(modules.outputReview?.reasons ?? []).map((r) => `[output] ${r}`),
    ...stressResult.reasons.map((r) => `[stress] ${r}`),
  ];

  const passed = allReasons.length === 0;

  return { passed, modules, allReasons };
}
