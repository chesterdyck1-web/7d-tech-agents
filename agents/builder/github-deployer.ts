// Creates a GitHub draft PR with all scaffolded files.
// Draft PRs cannot be accidentally merged — Chester must mark it ready first.
// This is the approval gate: nothing ships until Chester reviews and merges.

import { getBranchSha, createBranch, upsertFile, createDraftPR } from "@/lib/github";
import type { BuildSpec } from "./spec-parser";
import type { ScaffoldedFile } from "./agent-scaffolder";

interface DeployExtras {
  makeSpec?: string | null;
  vapiConfig?: string | null;
}

export async function deployToPR(
  spec: BuildSpec,
  files: ScaffoldedFile[],
  extras: DeployExtras
): Promise<string> {
  const timestamp = Date.now();
  const branchName = `beau/build-${spec.agentName}-${timestamp}`;

  const mainSha = await getBranchSha("main");
  await createBranch(branchName, mainSha);

  // Commit all generated agent files
  for (const file of files) {
    await upsertFile(
      branchName,
      file.path,
      file.content,
      `[Beau] scaffold ${spec.agentName}: ${file.path}`
    );
  }

  // Commit Make spec as a markdown doc if present
  if (extras.makeSpec) {
    await upsertFile(
      branchName,
      `agents/${spec.agentName}/make-scenario-spec.md`,
      `# Make.com Scenario Spec — ${spec.agentDisplayName}\n\n${extras.makeSpec}`,
      `[Beau] add Make.com spec for ${spec.agentName}`
    );
  }

  // Commit Vapi config as a markdown doc if present
  if (extras.vapiConfig) {
    await upsertFile(
      branchName,
      `agents/${spec.agentName}/vapi-script.md`,
      `# Vapi Call Script — ${spec.agentDisplayName}\n\n${extras.vapiConfig}`,
      `[Beau] add Vapi script for ${spec.agentName}`
    );
  }

  // Build the PR description
  const prBody = [
    `## ${spec.agentDisplayName}`,
    "",
    `**Purpose:** ${spec.purpose}`,
    `**Trigger:** ${spec.trigger}`,
    "",
    "### What Beau generated",
    ...files.map((f) => `- \`${f.path}\``),
    ...(extras.makeSpec ? [`- \`agents/${spec.agentName}/make-scenario-spec.md\``] : []),
    ...(extras.vapiConfig ? [`- \`agents/${spec.agentName}/vapi-script.md\``] : []),
    "",
    "### Before merging",
    "- [ ] Review the scaffolded code and fill in the TODO sections",
    ...(spec.sheetsNeeded.length > 0
      ? [`- [ ] Create these Google Sheets tabs: ${spec.sheetsNeeded.join(", ")}`]
      : []),
    ...(extras.makeSpec ? ["- [ ] Build the Make.com scenario using the spec in make-scenario-spec.md"] : []),
    ...(extras.vapiConfig ? ["- [ ] Configure the Vapi assistant using the script in vapi-script.md"] : []),
    "- [ ] Wire the new intent into agents/coordinator/router.ts and index.ts",
    "",
    "_Draft PR opened by Beau. Merge only after review._",
  ].join("\n");

  const prUrl = await createDraftPR(
    branchName,
    `[Beau] ${spec.agentDisplayName} scaffold`,
    prBody
  );

  return prUrl;
}
