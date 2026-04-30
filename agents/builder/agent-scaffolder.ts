// Generates TypeScript file stubs for a new agent based on the parsed spec.
// Code is intentionally placeholder — it compiles but needs real implementation.
// Chester reviews and merges the PR; no code ships without human approval.

import { claude } from "@/lib/claude";
import type { BuildSpec } from "./spec-parser";
import { getPromptOverride } from "@/lib/prompts";

export interface ScaffoldedFile {
  path: string;
  content: string;
}

// A representative example of an existing agent so Claude follows the same patterns
const EXAMPLE_AGENT = `
// Content Agent (Clive) — turns long-form video into short clips and schedules them.
import { appendToSheet } from "@/lib/google-sheets";
import { claude } from "@/lib/claude";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";

export async function submitVideoForClipping(driveUrl: string): Promise<void> {
  // validate input
  // call external API
  // write result to sheet
  // log action
  // notify Chester
}
`.trim();

export async function scaffoldAgent(spec: BuildSpec): Promise<ScaffoldedFile[]> {
  const functionList = spec.keyFunctions
    .map((f) => `- ${f.name}(): ${f.description}`)
    .join("\n");

  const SCAFFOLDER_SYSTEM = `You are a TypeScript developer generating a scaffold for a new agent in a Next.js/TypeScript codebase.
Follow these patterns exactly:
- Import only from @/lib/* and @/config/*
- Use async/await throughout
- Every function calls log() from @/lib/logger after completing work
- Every function that notifies Chester calls sendToChester() from @/lib/telegram
- Add a one-line comment above each function explaining its business purpose
- Leave TODO comments inside function bodies where real logic goes
- Do NOT use console.log
- Do NOT add error handling beyond a try/catch that calls log() with status: "failure"

Example of an existing agent for reference:
${EXAMPLE_AGENT}`;

  const system = (await getPromptOverride("builder", "scaffolder")) ?? SCAFFOLDER_SYSTEM;
  const res = await claude({
    system,
    userMessage: `Generate the TypeScript content for agents/${spec.agentName}/index.ts.

Agent: ${spec.agentDisplayName}
Purpose: ${spec.purpose}
Trigger: ${spec.trigger}
Inputs: ${spec.inputs.join(", ")}
Outputs: ${spec.outputs.join(", ")}
Needs approval gate: ${spec.needsApproval}

Functions to implement:
${functionList}

Output ONLY the TypeScript file content — no markdown fences, no explanation.`,
    maxTokens: 1200,
    label: "builder:scaffold-agent",
  });

  const files: ScaffoldedFile[] = [
    {
      path: `agents/${spec.agentName}/index.ts`,
      content: res.text.trim(),
    },
  ];

  // If new sheets are needed, generate a setup helper
  if (spec.sheetsNeeded.length > 0) {
    files.push({
      path: `agents/${spec.agentName}/sheet-setup.md`,
      content: [
        `# Google Sheets Setup for ${spec.agentDisplayName}`,
        "",
        "Create the following new tabs in the 7D Tech Google Sheet:",
        "",
        ...spec.sheetsNeeded.map((sheet) => `## ${sheet}\nAdd headers for this agent's data. Refer to existing sheets for column conventions.`),
      ].join("\n"),
    });
  }

  return files;
}
