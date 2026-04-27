// GitHub REST API helpers.
// Used by the Builder Agent to create branches, commit files, and open draft PRs.
// All writes require Chester to manually merge — Beau never auto-deploys.

import { env } from "@/lib/env";

const BASE = "https://api.github.com";

function authHeaders() {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

// Get the current SHA for the tip of a branch.
export async function getBranchSha(branch = "main"): Promise<string> {
  const res = await fetch(
    `${BASE}/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/git/ref/heads/${branch}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`GitHub getBranchSha failed: ${await res.text()}`);
  const data = (await res.json()) as { object: { sha: string } };
  return data.object.sha;
}

// Create a new branch off a given commit SHA.
export async function createBranch(branchName: string, fromSha: string): Promise<void> {
  const res = await fetch(
    `${BASE}/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/git/refs`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: fromSha }),
    }
  );
  if (!res.ok) throw new Error(`GitHub createBranch failed: ${await res.text()}`);
}

// Create or update a single file on a branch.
export async function upsertFile(
  branchName: string,
  filePath: string,
  content: string,
  commitMessage: string
): Promise<void> {
  // Fetch existing file SHA if it exists (required for updates)
  let existingSha: string | undefined;
  const checkRes = await fetch(
    `${BASE}/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${filePath}?ref=${branchName}`,
    { headers: authHeaders() }
  );
  if (checkRes.ok) {
    const data = (await checkRes.json()) as { sha: string };
    existingSha = data.sha;
  }

  const res = await fetch(
    `${BASE}/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${filePath}`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(content).toString("base64"),
        branch: branchName,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    }
  );
  if (!res.ok) throw new Error(`GitHub upsertFile failed (${filePath}): ${await res.text()}`);
}

// Open a draft pull request and return its HTML URL.
// Draft means it cannot be accidentally merged — Chester must mark it ready first.
export async function createDraftPR(
  branchName: string,
  title: string,
  body: string,
  baseBranch = "main"
): Promise<string> {
  const res = await fetch(
    `${BASE}/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/pulls`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title, body, head: branchName, base: baseBranch, draft: true }),
    }
  );
  if (!res.ok) throw new Error(`GitHub createDraftPR failed: ${await res.text()}`);
  const data = (await res.json()) as { html_url: string };
  return data.html_url;
}
