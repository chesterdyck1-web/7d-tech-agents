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
- [ ] Phase 2: Prospecting and Outreach  
- [ ] Phase 3: Fulfillment and Product
- [ ] Phase 4: Content and Intelligence
- [ ] Phase 5: Hardening

## Definition of Done
A phase is complete when:
1. All items built and verified
2. End-to-end test passed
3. Chester has reviewed and approved
4. No blocking bugs in Action Log