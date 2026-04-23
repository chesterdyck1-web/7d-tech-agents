// Visits a business website and extracts a contact email address.
// Used by the Prospecting Agent after finding leads via Google Places.

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Domains we never want to use as contact emails
const IGNORED_DOMAINS = [
  "sentry.io", "example.com", "googleapis.com", "gstatic.com",
  "facebook.com", "instagram.com", "twitter.com", "linkedin.com",
  "google.com", "apple.com", "microsoft.com", "cloudflare.com",
  "wixpress.com", "squarespace.com", "wordpress.com",
];

export async function scrapeEmailFromWebsite(
  websiteUrl: string
): Promise<string | null> {
  if (!websiteUrl) return null;

  try {
    const url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; 7DTechBot/1.0)" },
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Also check /contact page if no email found on homepage
    const emails = extractEmails(html);
    if (emails.length > 0) return emails[0] ?? null;

    // Try /contact
    const contactUrl = new URL("/contact", url).toString();
    try {
      const contactRes = await fetch(contactUrl, {
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; 7DTechBot/1.0)" },
      });
      if (contactRes.ok) {
        const contactHtml = await contactRes.text();
        const contactEmails = extractEmails(contactHtml);
        if (contactEmails.length > 0) return contactEmails[0] ?? null;
      }
    } catch {
      // /contact page not found — that is fine
    }

    return null;
  } catch {
    return null;
  }
}

function extractEmails(html: string): string[] {
  const found = html.match(EMAIL_REGEX) ?? [];
  return found
    .map((e) => e.toLowerCase())
    .filter((e) => {
      const domain = e.split("@")[1] ?? "";
      return !IGNORED_DOMAINS.some((d) => domain.includes(d));
    })
    .filter((e, i, arr) => arr.indexOf(e) === i); // deduplicate
}
