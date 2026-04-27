// Builder Agent (Beau) — scaffolds new agents from Chester's plain-English requests.
// Never deploys autonomously. All output goes into a GitHub draft PR for Chester's review.
// Chester merges the PR to ship; everything else is hands-off.

import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { parseSpec } from "./spec-parser";
import { scaffoldAgent } from "./agent-scaffolder";
import { buildMakeSpec } from "./make-builder";
import { buildVapiConfig } from "./vapi-configurator";
import { deployToPR } from "./github-deployer";

export async function runBuildRequest(rawRequest: string): Promise<void> {
  await sendToChester("Got it — parsing your request and scaffolding the agent now. Back in a minute.");

  let spec;
  try {
    spec = await parseSpec(rawRequest);
  } catch (err) {
    await sendToChester(`Could not parse the build request: ${String(err)}`);
    return;
  }

  await sendToChester(
    `Spec parsed:\n*${spec.agentDisplayName}* — ${spec.purpose}\nGenerating code now.`
  );

  // Run code generation and optional Make/Vapi specs in parallel
  const [files, makeSpec, vapiConfig] = await Promise.all([
    scaffoldAgent(spec),
    buildMakeSpec(spec),
    buildVapiConfig(spec),
  ]);

  let prUrl: string;
  try {
    prUrl = await deployToPR(spec, files, { makeSpec, vapiConfig });
  } catch (err) {
    await log({
      agent: "builder",
      action: "pr_creation_failed",
      status: "failure",
      errorMessage: String(err),
    });
    await sendToChester(`Code was generated but the GitHub PR failed: ${String(err)}\n\nTry again or check your GITHUB_TOKEN.`);
    return;
  }

  await log({
    agent: "builder",
    action: "scaffold_complete",
    status: "success",
    metadata: {
      agentName: spec.agentName,
      filesGenerated: files.length,
      needsMake: spec.needsMake,
      needsVapi: spec.needsVapi,
    } as unknown as Record<string, unknown>,
  });

  const summary = [
    `*BEAU — BUILD COMPLETE*`,
    `Agent: ${spec.agentDisplayName}`,
    `Files: ${files.length} generated`,
    ...(makeSpec ? ["Make.com spec: included"] : []),
    ...(vapiConfig ? ["Vapi script: included"] : []),
    "",
    `Draft PR (review before merging):`,
    prUrl,
  ].join("\n");

  await sendToChester(summary);
}
