import { z } from "zod";

const envSchema = z.object({
  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHESTER_CHAT_ID: z.string().min(1),

  // Google
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REFRESH_TOKEN: z.string().min(1),
  GOOGLE_SHEETS_ID: z.string().min(1),
  GOOGLE_PLACES_API_KEY: z.string().min(1),

  // Vapi
  VAPI_API_KEY: z.string().min(1),
  VAPI_ASSISTANT_ID: z.string().min(1),

  // Make.com
  MAKE_API_KEY: z.string().min(1),
  MAKE_TEAM_ID: z.string().min(1),
  MAKE_WEBHOOK_SECRET: z.string().min(1),
  MAKE_TEMPLATE_SCENARIO_ID: z.string().default("0"),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // OpusClip
  OPUS_CLIP_API_KEY: z.string().min(1),

  // Publer
  PUBLER_API_KEY: z.string().min(1),

  // GitHub
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_REPO_OWNER: z.string().min(1),
  GITHUB_REPO_NAME: z.string().min(1),

  // Security
  APPROVAL_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(32),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Missing or invalid environment variables — server cannot start:\n${missing}\n\nCopy .env.example to .env.local and fill in all values.`
  );
}

export const env = parsed.data;
