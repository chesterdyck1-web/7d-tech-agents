// One-time script: creates the First Response Rx Vapi assistant.
// Run: npx tsx --env-file=.env.local scripts/create-vapi-assistant.ts
// Copy the assistant ID printed at the end into VAPI_ASSISTANT_ID in .env.local and Vercel.

const VAPI_API_KEY = process.env["VAPI_API_KEY"]!;

const SYSTEM_PROMPT = `
You are calling on behalf of Chester Dyck at 7D Tech.
Your goal: book a 15-minute demo call.

RULES:
- Never mention AI, automation, Claude, or technology
- Sell on outcome only: stop losing leads, faster response, more bookings
- Be conversational, warm, and brief
- If they say not interested: thank them and end the call politely
- If they agree to a time: confirm it clearly and say Chester will send a calendar invite

Variables available: {{businessName}}, {{ownerName}}, {{vertical}}, {{slot1Human}}, {{slot2Human}}
`.trim();

async function createAssistant() {
  const res = await fetch("https://api.vapi.ai/assistant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VAPI_API_KEY}`,
    },
    body: JSON.stringify({
      name: "7D Tech - First Response Rx",
      model: {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        messages: [{ role: "system", content: SYSTEM_PROMPT }],
        temperature: 0.7,
      },
      voice: {
        provider: "openai",
        voiceId: "nova",
      },
      firstMessage:
        "Hi, is this {{ownerName}} from {{businessName}}? I'll be quick — 30 seconds?",
      endCallMessage: "Thanks for your time. Have a great day.",
      endCallPhrases: ["goodbye", "not interested", "take me off your list"],
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Error creating assistant:", err);
    process.exit(1);
  }

  const data = (await res.json()) as { id: string; name: string };
  console.log("\n── Vapi Assistant Created ─────────────────────────────────");
  console.log(`Name: ${data.name}`);
  console.log(`\nAdd this to .env.local and Vercel:\n`);
  console.log(`VAPI_ASSISTANT_ID=${data.id}`);
  console.log("──────────────────────────────────────────────────────────\n");
}

createAssistant();
