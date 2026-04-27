# 7D Tech — Agent Business System
Last updated: April 2026

## Project Overview
AI automation agency selling First Response Rx — a speed-to-lead 
product where AI drafts hyper-personalized replies to contact form 
submissions, owner approves with one tap, reply sends automatically.
Target clients: Canadian service businesses (gyms, photographers, 
massage therapists, chiropractors, personal trainers, landscapers).

## Owner
Chester Dyck — maintenance technician running this as a parallel 
venture. Non-technical founder. Plain English explanations required 
for all decisions. No jargon without definition.

## Business Goal
Replace Chester's day job by August 2026. Every build decision 
should move toward cash flow as fast as possible. Ship working 
over perfect.

## Tech Stack
- TypeScript + Next.js on Vercel
- Google Sheets as database
- Claude API as AI brain
- Make.com for automation orchestration
- Vapi for AI voice calls
- Telegram for Chester's daily interface
- Gmail + Google Calendar + Google Drive via OAuth
- GitHub for version control

## Architecture
Multi-agent system with Coordinator at top. Specialist agents:
Prospecting, Outreach, Fulfillment, Content, Intelligence, 
RedTeam, Builder, QA, AuditAgent. All report to Coordinator.
Chester talks to Coordinator only via Telegram @7DTechBot.

## Critical Rules

### Scope
- Build only what is in the approved phase plan
- If a request would add scope, STOP and flag it explicitly:
  "This is outside Phase X scope. Confirm before proceeding."
- Complete one phase fully before suggesting additions
- Never refactor working code unless it is blocking progress

### Security — Non-Negotiable
- NEVER hardcode API keys, secrets, or credentials
- ALL secrets go in environment variables via lib/env.ts
- lib/env.ts uses Zod — server must fail at boot if any var missing
- Approval tokens: JWT HS256, single-use enforced
- Cron routes: require Authorization: Bearer {CRON_SECRET}
- Webhook routes: verify signatures before processing

### Human In The Loop — Non-Negotiable
- No agent sends client-facing communication without approval
- Chester approves outreach emails via one-tap email link
- Clients approve their First Response Rx replies via one-tap link
- Approval tokens expire: 24h for Chester, 1h for clients
- Nothing goes live without QA Agent sign-off

### Build Order
Always build in this order within each phase:
1. lib/ layer first (shared utilities)
2. Google Sheets schema
3. Core logic
4. API routes
5. UI last

### Code Standards
- TypeScript strict mode always
- Zod validation on all external inputs
- Every agent action logged to Action Log sheet
- Error messages must be human-readable for Chester
- All functions need brief comments explaining business purpose
- No unnecessary dependencies — check if existing lib/ covers it first

### Testing
- Build verification test for every critical path
- Approval flow must be tested end-to-end before any other agent
- Deduplication must be tested with duplicate data before outreach
- Never mark a phase complete without running verification plan

### Context Management
- When compacting: preserve modified files list and current phase status
- Start each session by stating current phase and last completed item
- If context is getting long, summarize progress before continuing

### Debt and Cleanup
- Flag technical debt immediately but do not fix it mid-phase
- Log debt items in a DEBT.md file for post-launch cleanup
- Never leave console.log statements in production code

## Phase Status
Track current phase here and update after each completed item:
- [x] Phase 1: Foundation — completed April 22, 2026
- [x] Phase 2: Prospecting and Outreach — completed April 23, 2026
- [x] Phase 3: Fulfillment and Product — completed April 26, 2026
- [x] Phase 4: Content and Intelligence — completed April 26, 2026
  - [x] QA Agent (Quinn) — automation-tester, output-reviewer, stress-tester, unified runFullQA()
  - [x] lib/metrics.ts + config/benchmarks.ts
  - [x] Performance Metrics cron (Monday 6 AM ET)
  - [x] Content Agent (Clive) — OpusClip + Publer + approval flow
  - [x] Intelligence Agent (Iris) — competitor scraper, reviews miner, performance analyzer, weekly brief
  - [x] Red Team Agent (Red) — log auditor, script evaluator, monthly report
  - [x] Builder Agent (Beau) — spec parser, scaffolder, Make spec, Vapi config, GitHub draft PR
  - [x] Coordinator daily brief update (intel findings, red team flags, fixed performance alerts)
- [x] Phase 5: Hardening — completed April 26, 2026
  - [x] Audit Agent — live check of client Make scenario + webhook test
  - [x] Health check endpoint (/api/health) — tests Sheets, Gmail, Make, Claude
  - [x] Reply Tracker — polls Gmail twice daily for prospect replies, alerts Chester
  - [x] Failure Monitor — checks for 3+ consecutive failures every 6h, alerts immediately
  - [x] Content Engagement — Publer analytics → weekly engagement score metric
  - [x] Coordinator wired for run_audit with business name parsing
  - [x] Two new crons: reply-tracker (9 AM + 3 PM), monitor (every 6h)
- [x] Phase 7: Leadership Team — completed April 27, 2026
  - [x] Alistair (Maintenance Agent) — daily system health check, auto-fix inactive Make scenarios
  - [x] Franklin (CFO Agent) — daily revenue/costs/funds, profitability ratio, close rate, payment alerts
  - [x] Lexington (Legal Agent) — weekly CASL audit, ToS monitoring, GST/HST deadline reminders
  - [x] Chichester (CTO Agent) — weekly AI model currency check, npm dependency health
  - [x] Cron routes for all four leadership agents
  - [x] lib/stripe-reader.ts — Stripe revenue summary helper
  - [x] lib/vapi.ts updated — listCalls() for transcript analysis
- [x] Phase 8: Sales Intelligence and Pricing — completed April 27, 2026
  - [x] Dorian (Sales Agent) — weekly Vapi call analysis, coaching brief, script update proposals
  - [x] Franklin pricing loop — close rate thresholds trigger price-increase recommendation (Chester approval required)
  - [x] Coordinator updated — view_financial, view_coaching, view_tech_brief intents
  - [x] Daily brief updated — Franklin financial summary included every morning
  - [x] Live dashboard at /dashboard — Victorian aesthetic, 8 live metrics, activity feed, PWA manifest

## Definition of Done
A phase is complete when:
1. All items built and verified
2. End-to-end test passed
3. Chester has reviewed and approved
4. No blocking bugs in Action Log