// Monitors critical npm dependencies for major version updates.
// Calls the npm registry API — no local npm needed at runtime.
// Only flags if the installed version is a full major version behind latest.

export interface PackageStatus {
  name: string;
  installed: string;
  latest: string;
  majorsBehind: number;
}

// Critical packages for this system — update installed versions after each upgrade.
const TRACKED_PACKAGES: Record<string, string> = {
  next: "15.3.1",
  "@anthropic-ai/sdk": "0.39.0",
  stripe: "17.7.0",
  jose: "5.9.6",
  zod: "3.24.3",
  googleapis: "144.0.0",
};

function parseMajor(version: string): number {
  return parseInt(version.replace(/^[^0-9]*/, "").split(".")[0] ?? "0", 10);
}

async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(packageName).replace("%40", "@").replace("%2F", "/");
    const res = await fetch(`https://registry.npmjs.org/${encoded}/latest`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

// Returns packages where installed major version is behind latest major version.
export async function checkStackHealth(): Promise<PackageStatus[]> {
  const results = await Promise.allSettled(
    Object.entries(TRACKED_PACKAGES).map(async ([name, installed]) => {
      const latest = await fetchLatestVersion(name);
      if (!latest) return null;
      const installedMajor = parseMajor(installed);
      const latestMajor = parseMajor(latest);
      const majorsBehind = latestMajor - installedMajor;
      if (majorsBehind <= 0) return null;
      return { name, installed, latest, majorsBehind } satisfies PackageStatus;
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<PackageStatus | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is PackageStatus => v !== null);
}
