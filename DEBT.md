# Technical Debt Log
Flagged during Phase 5 backend hardening (May 2026). Fix after launch.

---

## DEBT-001: In-memory rate limiter is per-instance only
**File:** `lib/rate-limiter.ts`
**Risk:** Medium
Vercel spins up multiple function instances. Each instance has its own token bucket, so a burst of traffic distributed across instances can exceed the intended per-service limit. At current scale this is fine, but under load it will pass more requests than expected.
**Fix:** Replace token buckets with Redis-backed counters (e.g., Vercel KV or Upstash). One key per service, atomically decremented with TTL.

---

## DEBT-002: Circuit breaker state is per-instance only
**File:** `lib/circuit-breaker.ts`
**Risk:** Medium
Circuit breaker failure counts and open/closed state live in memory. If Sheets is down, instance A may open its circuit while instances B and C keep hammering the service. Recovery also resets per-instance, so the service gets retried by each instance independently.
**Fix:** Persist circuit state to Redis (same KV store as DEBT-001). Shared state means one open circuit protects all instances simultaneously.

---

## DEBT-003: Gmail daily quota check is per-invocation only
**File:** `lib/gmail.ts` → `checkGmailDailyQuota()`
**Risk:** Low-Medium
The 100 emails/day limit is enforced by reading today's Action Log at the time of each send. Under parallel execution (e.g., large outreach batch), two concurrent invocations can both read the same count and both proceed — slightly exceeding the limit.
**Fix:** Use Redis atomic increment with a daily TTL key, or serialize outreach sends through a queue (Vercel Queues once available).

---

## DEBT-004: Calendar idempotency is best-effort
**File:** `lib/google-calendar.ts` → `createBookingEvent()`
**Risk:** Low
Duplicate detection lists events in a ±1h window around the requested time. A very narrow race condition exists: two concurrent booking requests for the same slot could both pass the check before either writes. Unlikely in practice given Chester's one-client-at-a-time volume.
**Fix:** Use Google Calendar's `conferenceDataVersion` + idempotency key in extended properties, or serialize booking through a queue.

---

## DEBT-005: Vapi webhook idempotency scans full Action Log
**File:** `app/api/webhooks/vapi/route.ts`
**Risk:** Low (performance)
To check for duplicate `vapi_call_ended` entries, the route reads every row of the Action Log and filters in memory. This is fine now but will slow down as the log grows.
**Fix:** Add a dedicated "Vapi Events" sheet with `call_id` as indexed key, or store processed call IDs in Redis with a 24h TTL.

---

## DEBT-006: Data integrity check does not block prospecting
**File:** `agents/integrity/index.ts`
**Risk:** Low (by design)
The integrity check runs at 10 AM UTC, prospecting at 11 AM UTC. If integrity finds issues, it sends Chester a Telegram alert but does not stop the prospecting cron. A future improvement could have integrity write a "block flag" to Sheets that prospecting reads before starting.
**Fix:** Add a `system_flags` Sheets tab. Integrity writes `prospecting_blocked: true` on critical failures. Prospecting checks this flag at startup and aborts if set.

---

## DEBT-007: Approval rate limiter state is per-instance
**File:** `app/api/approve/route.ts`
**Risk:** Low
Same issue as DEBT-001/002. The Map storing per-IP request counts is in-memory per instance. A determined attacker using multiple Vercel instances as targets could exceed the 10/min limit. Acceptable for now given the low-volume use case.
**Fix:** Move to Redis-backed rate limiter shared across instances.
