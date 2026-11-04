# Team (as of 4 November 2026)

Two founders: Adam Lam and Melvin To. Marvin Seng left the founders on 4 Nov 2026 and has no role in the company.

Both founders are 21 and university students. YC expects founders full time during and after the batch (Winter 2027 runs January to March 2027), so each founder confirms full-time availability before the batch.

| Person | Role | Where | Background (from CVs) |
|---|---|---|---|
| Yee Lok Adam Lam (lead) | Co-founder and CEO (internal title: CEO and Head of Revenue): strategy, pricing, sales, marketing, design, finance, legal; signs contracts and HIPAA agreements. Builds the software: writes all the code (frontend, backend, setup) with Claude Code. HIPAA security official and owner of the engineer and reviewer agents (both from 4 Nov 2026). | Sydney | UNSW Bachelor of Information Systems (Dec 2026 expected, WAM 81). Founder and Director, ROUL Media (Feb 2026 to now: 100+ client projects, A$20,000+ revenue in the first two months, 20+ contract creatives). HSBC Sydney banker (Apr to Jul 2026, AML/KYC and responsible lending). CSOP Asset Management HK trading intern; Nestle Australia analytics intern. Westpac and AFR Top100 Future Leaders 2026; Peter Farrell Cup finalist. Python, SQL, Excel, Power BI, Notion. English, Cantonese, Mandarin, French (B1). |
| Melvin To | Co-founder and Head of Claims Operations; HIPAA privacy contact: reviews and approves every appeal, payer portals and calls, customer success. Trains on US appeal rules first. Joins Adam's practice sales calls from week 3 (from 23 Nov 2026). Reviews and merges the pull requests that Adam's Claude sessions and agents open (from 4 Nov 2026), because nobody merges their own. | Sydney | Macquarie University Bachelor of Business (Marketing). AIA Group insurance agent intern (2025 to now: insurance products and sales training). ROUL Media founding team and relationship manager (client communication, sales, recruiting). FutureNow entrepreneurship education intern. Peter Farrell Cup finalist. |

HIPAA security official (general information, not legal advice): the HIPAA Security Rule says a business associate must name the security official responsible for its security policies and procedures (45 CFR 164.308(a)(2), read 4 Nov 2026 at https://www.law.cornell.edu/cfr/text/45/164.308). That is Adam from 4 Nov 2026. Melvin stays the privacy contact.

## Who took over Marvin's duties (4 Nov 2026)

| Duty | Now |
|---|---|
| Build the platform, AI agents and data (the CTO work) | Adam |
| HIPAA security official (45 CFR 164.308(a)(2)) | Adam |
| Owner of the engineer and reviewer agents (agents/engineer.md, agents/reviewer.md, agents/schedule.json) | Adam |
| Check engineer and reviewer output and failed runs at the start of each day | Adam |
| Review and merge pull requests that Claude sessions and agents open (they all appear as Adam on GitHub) | Melvin |
| Connect Cloudflare Pages to the repository | Adam |
| Folder owner of agents/, prototype/ and data/ | Adam |
| Accounts, AWS plan, Claude Console organisations; ask Anthropic about HIPAA readiness for the zone1-claims organisation | Adam |
| Build the 50 made-up test claims (with Melvin) | Adam |
| Plant errors in claims Melvin has not seen, for his blind test (proposed) | Adam |
| Security check before real data | Adam |

## Role decision (3 Nov 2026)

Option A chosen: Melvin stays Head of Claims Operations and trains on US appeal rules first. Option B (Melvin to Head of Sales and Practices, Adam adds claims quality) was rejected.

Why:
- Clearest split: Adam sells, Melvin runs claims. (On 3 Nov 2026 Marvin was to build; since 4 Nov 2026 Adam builds too.)
- Adam stays on work he has proven (ROUL Media: A$20,000+ in its first two months).
- Daily, deadline-bound appeal review stays off the busiest person's desk.
- Melvin is the live test of the product: a non-specialist founder approving good appeals with our AI. If he cannot, we learn it cheaply on made-up claims.

Known risks to watch: Melvin starts from zero on US billing; early errors could cost a practice's trust; Adam's plate stays wide, and wider since 4 Nov 2026, because he now also builds the software and is the HIPAA security official; the first appeal (target Fri 4 Dec 2026) could slip.

## First 4 weeks (Marvin's tasks moved to Adam on 4 Nov 2026)

| Week | Adam | Melvin |
|---|---|---|
| 1 (9 to 13 Nov) | Finish Delaware company, US bank, lawyer, insurance. Ask the lawyer: share of recovery or flat fee per win (Medicare: 42 CFR 424.73 and 424.80). List 50 target practices. Accounts, AWS plan, Claude Console organisations. | Medicare appeal basics: CMS MLN006562 appeals booklet, redetermination rules, most common CARC and RARC codes. Check zone1/deadline_rules.json against its sources. |
| 2 (16 to 20 Nov) | Outreach drafts and first discovery calls (US Eastern 9 am to 5 pm = 1 am to 9 am Sydney). Design system (first version made and confirmed by both founders on 4 Nov 2026). First agents as Claude Code scheduled tasks on the lean budget (no Paperclip or Grafana until revenue). | Write the appeal-checklist for the most common denial reasons. Build the 50 made-up test claims with Adam. |
| 3 (23 to 27 Nov) | Practice agreement and BAA templates from the lawyer. Pilot offer. Zone 1 pipeline and review screen; run the 50 test claims. | Review all 50 test claims on the review screen and pass the week 3 gate. Join Adam's practice calls. |
| 4 (30 Nov to 4 Dec) | Sign the first pilot practice and its BAA. Security check before real data. | Onboard the practice. Review and submit the first real appeal (target Fri 4 Dec 2026). |

The 3 Nov 2026 plan had a private GitHub repository made from claims-expert-ai-env.zip in week 1. That is no longer needed: the company filing cabinet is this repository, and the starter kit waits for revenue.

## Notes

- US billing rules are new to both founders. Melvin learns Medicare and US insurer appeal rules first; an optional later US credential is AAPC Certified Professional Biller.
- Open question (not decided): a part-time experienced US biller as an adviser, paid hourly or with a small equity share, to review the checklist and the first 10 appeals. Costs money or equity, so the founders decide before anything is done.
- Time zones (November): US Eastern 9 am to 5 pm = 1 am to 9 am Sydney. Monday review 11:00 am Sydney, or a time that suits both founders.
