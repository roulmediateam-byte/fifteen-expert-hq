# Worker console demo

FAKE: every claim, patient, practice, payer address and number here is made up. No real patient data.

A clickable demo of the appeals worker console. It shows how software plus a short training lets an ordinary trained worker write an expert appeal: the Simulated AI drafts, the worker checks each step with a coach beside them, a checker runs ten checks, and Melvin (Head of Claims Operations) approves before anything is sent.

Owner: Adam. Reviewer: Melvin. Progress and open items: [PROGRESS.md](PROGRESS.md).

## Run it

No install, no build, no login, no backend.

```
node site/demo/worker/scripts/serve.mjs
```

Then open http://127.0.0.1:8080/ in a browser. (Opening index.html straight from the disk does not work, because browsers block JavaScript modules on file:// pages.) Any static web server works too.

- The demo date is fixed at Thursday, Nov 5, 2026, so the made-up deadlines stay the same.
- State lives in memory. A reload starts again, unless "Save my progress in this browser" is ticked (off by default).
- Address options, for a live presentation or a hosted copy:
  - `?name=YourName` shows a company name, without saving it anywhere. The repository keeps the placeholder "[Company name]" until the domain is bought.
  - `?role=presenter` opens on the guided tour, and `?role=reviewer` opens Melvin's view. Without it, the demo opens as Jordan (START_ROLE in js/brand.js).
  - They combine: `?name=YourName&role=presenter`.

## Hosted copy

The public copy runs on a Cloudflare Pages project of its own. Its name and address show the company name, so they are kept out of this repository, in the founders' private notes. The branch claude/worker-demo-pages holds only this folder's files, at its top level, so the host needs no build tool.

Cloudflare Pages settings (the repository owner sets them once; hq/SETUP.md, section 3, walks through the same screens):

- Production branch: claude/worker-demo-pages. Framework preset: None. Build command: `node scripts/hosted_settings.mjs`. Build output directory: `/` (or `.` if the box refuses `/`). Root directory: blank.
- Settings, Variables and Secrets, for Production: `COMPANY_NAME` (Text: the name to show), `DEMO_START_ROLE` (Text: `presenter` opens the guided tour) and `DEMO_PORTAL_URL` (Text: the client portal demo's address, for the last tour step). The build writes them into js/brand.js in the host's own copy only, so this repository keeps "[Company name]" and no address.
- Builds, Branch control: Preview branches None, so no other branch builds.

The live copy changes only when someone refreshes that branch, never by itself, so a nightly change reaches it only after a person has checked it. Then refresh the branch from the top of the repository, and the host redeploys within a few minutes:

```
git push --force origin "$(git subtree split -P site/demo/worker HEAD)":refs/heads/claude/worker-demo-pages
```

It replaces only that branch. The same branch also works on GitHub Pages (Settings, Pages, Deploy from a branch, claude/worker-demo-pages, / (root)); the empty .nojekyll file tells GitHub to serve the files as they are. GitHub Pages has no build step, so there the address needs `?name=YourName&role=presenter`.

The page is public, and everything in it is made up (FAKE). The page and _headers ask search engines not to index it.

## Roles and screens

Switch roles with the "View as" menu at the top right.

- Worker: Jordan (trained claims worker, demo).
- Reviewer: Melvin (Head of Claims Operations).
- Presenter: a guided tour in a side panel, with "Show this" buttons and Reset demo.

| Screen | Address | What it shows |
|---|---|---|
| Today | #/today | The queue, closest deadline first, with filters and four counts |
| Claim workspace | #/claim/C-1012 | Documents, steps a to g, and the coach panel |
| Letter editor | #/claim/C-1012/e | The draft letter by part, facts highlighted, sources linked, edits marked |
| Checker | #/claim/C-1012/f | Ten checks with a Fix button on each failure |
| Review | #/review | Melvin's queue; approve, or send back with a reason |
| Submit and track | #/submit | Simulated sending, follow-up dates, outcomes and the fee |
| My progress | #/progress | Made-up history: minutes per appeal, catches, send-backs, training cards |
| Audit log | #/audit | Every action: who, what, which claim, when |

Tour claims: C-1012 (a clean, easy win), C-1027 (a planted misread member ID) and C-1033 (sent back by Melvin).

## Check it

```
node site/demo/worker/scripts/score_demo.mjs            # the checker against the 15 planted errors
node --test site/demo/worker/tests/logic.test.mjs       # logic tests, no browser needed
node site/demo/worker/tests/browser.test.mjs            # Chromium at 390, 320 and 1280 px
node site/demo/worker/tests/browser.test.mjs --shots    # the same, plus screenshots in screenshots/
node site/demo/worker/tests/walkthrough.mjs             # tour claim 1 from Today to Approved, clicks counted
```

The score targets are 15 of 15 planted errors caught, 0 false alarms and 50 of 50 complete deadline calculations. The checker never reads data/planted_errors.json; only the score script does.

The browser tests need Playwright and its Chromium, once, for example:

```
cd site/demo/worker && npm install --no-save playwright && npx playwright install chromium
```

Each script exits with code 1 when a target or a check fails.

## What is simulated

- "Simulated AI": the facts read from documents, their confidence, the drafts and "Likely to win" are fixed data and template text. No AI service is called.
- Sending, confirmation numbers, the practice sending a document, and payer decisions are buttons in the demo. Nothing leaves the page.
- Messages to practices are drafts. A person sends them.
- The fee (20% of the amount recovered) and the mail time (5 days) are our estimate.

## Where the rules come from

- rules/appeal_rules.json: Medicare appeal levels, deadlines and amounts from CMS pages, and denial code texts from the X12 lists, each with its source address and the date it was opened (Nov 5, 2026). Private payer rules (Demo Health Plan, Demo Mutual Plan) are made up and labelled "sample payer rule".
- rules/playbook.json: our own rules (categories, required evidence, tone, follow-up timing), labelled as ours.
- Anything about the law is general information, not legal advice.

## Files

| Path | What it is |
|---|---|
| index.html, app.css | The page and its styles |
| tokens.css | The design system tokens and fonts: the one file to swap |
| js/brand.js | The company name and logo slot |
| js/main.js, js/state.js | Routing, actions and the in-memory state |
| js/lib/ | Shared logic, also run by the scripts: dates, rules, evidence, letter, checker, coach |
| js/views/ | One file per screen |
| data/ | claims.json (50 FAKE claims) and planted_errors.json (the answer key) |
| scripts/ | make_demo_claims.mjs (writes data/, same output every run), score_demo.mjs, serve.mjs, hosted_settings.mjs (fills the name and start view on a host's build) |
| tests/ | Logic tests, browser tests and the walkthrough |
| screenshots/ | Every screen at 390 and 1280 px, from the last browser test run |
| assets/ | Cut-down fonts and their licences, and the icon licence |
| .nojekyll | Empty. Tells GitHub Pages to serve the files as they are |
| _headers | Asks search engines not to index the hosted copy (Cloudflare Pages reads it) |
