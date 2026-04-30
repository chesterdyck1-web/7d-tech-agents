// One-time script to get your Google OAuth refresh token.
// Run once: npx ts-node scripts/get-google-token.ts
// Then paste the refresh token into .env.local as GOOGLE_REFRESH_TOKEN.
// You never need to run this again unless you revoke access in Google.

import { createServer } from "http";
import { URL } from "url";

const CLIENT_ID = process.env["GOOGLE_CLIENT_ID"]!;
const CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"]!;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env.local");
  process.exit(1);
}

const REDIRECT_URI = "http://localhost:3456/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
].join(" ");

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log("\n── Google OAuth Token Generator ──────────────────────────────");
console.log("Open this URL in your browser and sign in with chester@7dtech.ca:\n");
console.log(authUrl);
console.log("\nWaiting for Google to redirect back...\n");

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) return;

  const url = new URL(req.url, "http://localhost:3456");
  const code = url.searchParams.get("code");

  if (!code) {
    res.end("Error: no code in callback. Try again.");
    server.close();
    return;
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const data = (await tokenRes.json()) as { refresh_token?: string; error?: string };

  if (data.error || !data.refresh_token) {
    res.end("Error getting token: " + JSON.stringify(data));
    console.error("Error:", data);
    server.close();
    return;
  }

  console.log("────────────────────────────────────────────────────────────");
  console.log("SUCCESS. Add this to your .env.local file:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);
  console.log("────────────────────────────────────────────────────────────\n");

  res.end("Done! Go back to the terminal and copy your refresh token.");
  server.close();
});

server.listen(3456);
