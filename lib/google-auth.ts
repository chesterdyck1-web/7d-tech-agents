// Shared Google OAuth2 client — all Google lib files import from here.
// Uses a single refresh token to access Sheets, Gmail, Calendar, and Drive.

import { google } from "googleapis";
import { env } from "@/lib/env";

export function getAuthClient() {
  const auth = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
  return auth;
}
