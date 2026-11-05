# fifteen-expert-hq: the company filing cabinet
HQ, the founders' dashboard of everything and every agent: https://fifteen-expert-hq.pages.dev (founders only; live once hq/SETUP.md is done). The Company view (company/) shows the company by department, read-only, behind a passcode: ask a founder for its address.
Shared files for The $15-an-Hour Expert. No patient data, ever: made-up data only, marked FAKE.
- Start with PROJECT_STATE.md (where things stand), then TEAM.md, COMPANY_BRIEF.md and BRAND_BRIEF.md.
- CLAUDE.md holds the rules every agent follows. PAUSE at the top level stops every agent, `PAUSE-<name>` one agent. Mission control (Issue #10) and HQ show them all.
- ops/: decisions.md (every decision), links.md (the single list of everything), kpis.json (numbers only a founder knows), setup-labels.md, dashboard/. ops/digest/: daily digest.
- yc/: YC application. brand/: name, logo, colours, voice. design/: deck, flyer, banners. site/: the website, served by Cloudflare.
- prototype/: product code, tested only on data/fake-claims/ (made-up claims). site/demo/: the demo page. agents/: briefs, schedule.json, departments.json. hq/: HQ. company/: the Company view.
- research/: appeal rules, payer policy, competitors. sales/: prospects, call guide, messages, call notes.
- finance/: budget, spend, invoices. legal/: lawyer questions, contract and BAA drafts, HIPAA policies.
- Every folder has a README.md that says what goes there and who owns it (.github/ is GitHub's own; hq/README.md and company/README.md cover their subfolders).
- Dated files start with the date as YYYY-MM-DD, for example 2026-11-09-lawyer-call.md. Names are lower case with hyphens: no spaces, capitals or underscores.
- One topic per file. No copies like final-v2 or old: edit the file, and git keeps every version.
- Exceptions: the fixed capitalised top-level names, each README.md, hq/SETUP.md and company/SETUP.md, Cloudflare's own file names in hq/ and company/ (_headers, _routes.json, _middleware.js), and code in prototype/, hq/ and company/ (its language's rules).
- Tasks are GitHub Issues with an agent: or human: label. Work on a claude/ branch, never on main; nobody merges their own pull request.
