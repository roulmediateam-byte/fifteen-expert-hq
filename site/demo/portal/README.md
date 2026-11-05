# Client portal demo

FAKE: every claim, patient, practice, invoice and number here is made up. No real patient data.

A clickable demo of the client portal: the practice's side of the appeals service. A small practice's office manager sends us denials, sees every appeal in plain words, sends the records we ask for, signs what needs signing, and sees what we won back and what we bill (only wins). It shows the same made-up claims as the worker console demo (site/demo/worker), from the other side.

Owner: Adam. Reviewer: Melvin. Progress and open items: [PROGRESS.md](PROGRESS.md).

## Run it

No install, no build, no login, no backend.

```
node site/demo/portal/scripts/serve.mjs
```

Then open http://127.0.0.1:8080/ in a browser. (Opening index.html straight from the disk does not work, because browsers block JavaScript modules on file:// pages.) Any static web server works too.

- The demo date is fixed at Thursday, Nov 5, 2026, the same as the worker console demo.
- State lives in memory. A reload starts again, unless "Save my progress in this browser" is ticked (off by default).
- The demo takes no files at all. "Send denials" offers only made-up sample files.
- Address options, for a live presentation or a hosted copy:
  - `?role=presenter` opens on the guided tour. Without it, the portal opens as the practice (START_ROLE in js/brand.js).
  - `?practice=DOR` (or DFM, DCA) opens as another made-up practice. The default is DFM.
  - `?name=YourName` shows a company name, without saving it anywhere. The repository keeps the placeholder "[Company name]" until the domain is bought.
  - They combine: `?name=YourName&role=presenter`.

## Hosted copy

The public copy runs on a Cloudflare Pages project of its own, set up like the worker console demo's. Its name and address show the company name, so they are kept out of this repository, in the founders' private notes. The branch claude/client-portal-pages holds only this folder's files, at its top level, so the host needs no build tool.

Cloudflare Pages settings (the repository owner sets them once; hq/SETUP.md, section 3, walks through the same screens):

- Production branch: claude/client-portal-pages. Framework preset: None. Build command: `node scripts/hosted_settings.mjs`. Build output directory: `/`. Root directory: blank.
- Variables (Text), for Production: `COMPANY_NAME` (the name to show), `DEMO_START_ROLE` (`presenter` opens the guided tour) and `DEMO_WORKER_URL` (the worker console demo's address, for the last tour step). The build writes them into js/brand.js in the host's own copy only, so this repository keeps the placeholders.
- Builds, Branch control: Preview branches None, so no other branch builds.

The live copy changes only when someone refreshes that branch. After a checked change, refresh it from the top of the repository, and the host redeploys within a few minutes:

```
git push --force origin "$(git subtree split -P site/demo/portal HEAD)":refs/heads/claude/client-portal-pages
```

It replaces only that branch. The page is public, and everything in it is made up (FAKE). The page and _headers ask search engines not to index it.

## Roles and screens

Switch with the "View as" menu at the top right: the office manager of Demo Family Medicine (DFM), the billing manager of Demo Orthopedics (DOR), the practice manager of Demo Cardiology (DCA), or the presenter's guided tour. A practice sees only its own claims.

| Screen | Address | What it shows |
|---|---|---|
| Home | #/home | Won back, appeals in progress, what needs the practice, the closest deadlines, the latest news |
| Send denials | #/send | Made-up sample files only: what the Simulated AI read, how sure it is, then add the appeals |
| Appeals | #/appeals | Every appeal in plain words, open ones first, the closest date first, with filters |
| Appeal | #/appeal/C-1012 | Why it was denied, the progress line, every step so far, the deadline and how it was worked out, the money, what we need, and the letter |
| Needs you | #/requests | Records, forms and letters to sign, the soonest first, each with the reason |
| Money | #/money | Won back by month, our fees (20% of each win, our estimate), the invoices and their lines |
| Reports | #/reports | Denials by reason, decided appeals by insurer, what to change before a claim goes out |
| Your practice | #/practice | How we file (appointed representative with CMS-1696, or the practice signs), agreements, team roles, notifications |

Tour claims: C-1012 (tour claim 1 in the worker demo), C-1045 (Demo Orthopedics signs its own letter) and C-1049 (a win: $210.00 paid to the practice, $42.00 fee).

## Where the data comes from

`scripts/make_portal_data.mjs` writes data/portal.json from the worker console demo's made-up claims and rules, so both demos show the same claims, deadlines and amounts. It adds:

- The stage a practice understands (js/lib/portal.js maps the worker's stages; "Sent back by Melvin" shows as "Being written").
- Record requests: only for records not on file (for example the planted missing letter of medical necessity on C-1031).
- Made-up history so the money screens have numbers: 61 appeals decided and 41 won, the totals in the worker demo's own made-up history. Nobody has worked a real claim yet.
- One invoice a month per practice, only for wins, and two sample files per practice.

The script gives the same output every run. After any change to the worker demo's data or rules, run it again; a logic test fails while data/portal.json is stale.

```
node site/demo/portal/scripts/make_portal_data.mjs
```

## Check it

```
node --test site/demo/portal/tests/logic.test.mjs       # data in sync, deadlines, money, history, host settings
node site/demo/portal/tests/browser.test.mjs            # Chromium at 390, 320 and 1280 px, plus the practice's actions
node site/demo/portal/tests/browser.test.mjs --shots    # the same, plus screenshots in screenshots/
```

The browser tests need Playwright and its Chromium, once, for example:

```
cd site/demo/portal && npm install --no-save playwright && npx playwright install chromium
```

Each script exits with code 1 when a check fails.

## What is simulated

- "Simulated AI": what it read from a sample file and how sure it is are fixed data. No AI service is called.
- Sending a record, signing a form or a letter, and the notification settings are buttons in the demo. Nothing leaves the page.
- Decisions, payments, invoices and their terms are made up. The fee (20% of what the insurer pays on a win, nothing on a loss) is our estimate; a US lawyer confirms the fee terms before real use. General information, not legal advice.
- The CMS-1696 rule and the Medicare deadlines come from CMS pages opened on Nov 5, 2026 (site/demo/worker/rules/appeal_rules.json). Private insurer rules are made up and labelled "sample payer rule".

## Files

| Path | What it is |
|---|---|
| index.html, app.css | The page and its styles (the shared parts copied from the worker demo) |
| tokens.css | The design system tokens and fonts, the same as the worker demo's |
| js/brand.js | The company name, logo slot, start view and the worker demo's address |
| js/main.js, js/state.js | Routing, actions and the in-memory state |
| js/lib/ | portal.js (stages, totals, reports) and dates.js, also run by the scripts and tests |
| js/views/ | One file per screen, plus the shell and the presenter tour |
| data/portal.json | The made-up data (written by the script; do not edit by hand) |
| scripts/ | make_portal_data.mjs, serve.mjs, hosted_settings.mjs (fills the name, start view and worker link on a host's build) |
| tests/ | Logic tests and browser tests |
| screenshots/ | Every screen at 390 and 1280 px, from the last browser test run |
| assets/ | Cut-down fonts and their licences, and the icon licence |
| .nojekyll | Empty. Tells GitHub Pages to serve the files as they are |
| _headers | Asks search engines not to index the hosted copy (Cloudflare Pages reads it) |
