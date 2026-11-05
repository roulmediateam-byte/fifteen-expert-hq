# Company brief: The $15-an-Hour Expert

The founders chose the company name on 4 Nov 2026. It goes into this repository once the domain is bought; until then, files here use the working name, the title of YC's request.

## The idea in plain words
When a doctor's office sends a bill to an insurance company, the insurer often says no, and the office loses money it is owed. Most offices never fight back, because an appeal takes time and an expert who knows the rules. We let AI do the expert part: it reads the rejection, works out why it happened, and writes the letter asking the insurer to pay. An ordinary trained worker checks it and sends it. This matches YC's Winter 2027 request "The $15-an-Hour Expert" (Brad Flora): AI that turns an ordinary worker into an expert (https://www.ycombinator.com/rfs).

## Team
Two founders: Adam Lam (CEO; sells and builds the software) and Melvin To (Head of Claims Operations; approves every appeal). Marvin Seng left the founders on 4 Nov 2026. Details are in TEAM.md.

## How it earns
We only get paid when we win. The insurer pays the practice; then we invoice the practice either a share of what was recovered or a flat fee per win. Example (our estimate): a US$200 claim at a 20% fee earns us US$40.

Which fee is allowed waits for a US lawyer (general information, not legal advice). Medicare's billing agent rule, 42 CFR 424.73(b)(3), which 42 CFR 424.80(b)(5) applies to physicians and other suppliers, says that when Medicare pays an agent directly, the agent's pay cannot be tied to the amounts billed or collected. CMS manual text says these conditions do not apply to an agent that only prepares bills and never receives payments, and we never receive payer money. Where the rule does apply, a flat fee per win could fail too, not just a share. Sources: https://www.law.cornell.edu/cfr/text/42/424.73 and https://www.law.cornell.edu/cfr/text/42/424.80. (Corrected 4 Nov 2026: this brief used to say that Medicare bars billing agents from charging a share of collections, which is broader than the rule.)

## How big (US)
- Doctor and clinic spending: US$1.1 trillion in 2024 (CMS National Health Expenditure data, reported by Medical Economics on 14 Jan 2026).
- 47.4% of doctors work in practices of 10 or fewer (AMA Physician Practice Benchmark Survey, 2024).
- 12% to 15% of claims are denied at first: Kodiak Solutions found 11.81% in 2024 (hospitals and physicians); Premier found nearly 15% for private insurers (hospital claims from 2022).
- Our estimates (the working, 4 Nov 2026):
  - US$1.1 trillion x 47.4% = about US$521 billion at practices with 10 or fewer doctors.
  - x 12% to 15% = US$62.6 to 78.2 billion denied at first.
  - A third is never recovered = US$20.9 to 26.1 billion.
  - Half of that can be won = about US$10.4 to 13.0 billion a year could be won back.
  - A 20% fee on all of it is a fee pool of about US$2.1 to 2.6 billion a year. A realistic big outcome, a 1% to 5% share of the pool, is about US$21 to 130 million a year.
  - One trained reviewer approving about 1,000 appeals a month (about 46 a working day, about 10 minutes each, not measured) at about US$20 per appeal sent brings in about US$240,000 a year in fees.
- Weak points of the estimate: denial rates count claims but are applied to dollars; Premier's private insurer rate is applied to all payers; the sources draw on hospitals and physicians, so small practices may differ; the third and the half are assumptions, not measured.
- Sources: CMS (https://www.cms.gov/files/document/highlights.pdf); Medical Economics (https://www.medicaleconomics.com/view/health-care-spending-reaches-5-3-trillion-or-18-of-u-s-economy-in-2024); AMA (https://www.ama-assn.org/practice-management/private-practices/smaller-share-doctors-private-practice-ever); Kodiak Solutions (https://www.businesswire.com/news/home/20250521892947/en/Rate-of-initial-denials-of-medical-insurance-claims-continued-to-rise-in-2024-Kodiak-Solutions-proprietary-data-show); Premier (https://www.premierinc.com/newsroom/blog/trend-alert-private-payers-retain-profits-by-refusing-or-delaying-legitimate-medical-claims).

## Competitors
- Aegis (YC Spring 2025): AI agents for denied claims. Its homepage names hospitals, health systems and DME companies; it is also paid only from what it recovers; its YC launch post asks for introductions to independent practice owners.
- Claim Health (YC Spring 2025): AI revenue platform for post-acute care; US$4.4 million seed (Jan 2026).
- Counterforce Health: AI appeal letters, free to patients and caregivers; also serves clinics.
- Large revenue cycle companies.

## Setup plan
- Working setup until revenue: this public GitHub repository (filing cabinet, agent briefs, Mission control dashboard, HQ, website) and the "Prompt Playbook: $15-an-Hour Expert" (https://claude.ai/artifact/XTtj6UgGR8K8z3Lc4JPVFW).
- Full design and runbook: "AI-Native Company Setup: $15-an-Hour Expert", https://claude.ai/artifact/TQAWm7wprrHy7nYyPuSDQR.
- Starter kit: claims-expert-ai-env.zip (12 agents, Paperclip, Grafana). It waits for revenue.
