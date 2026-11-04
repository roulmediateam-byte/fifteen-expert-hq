# hq

Owner: Adam. Adam and Melvin use it every day.

What goes here: HQ, the founders' private web page that shows everything the company has and what every AI agent is doing, and lets a founder give an agent work. Set it up once with SETUP.md. No patient data, ever.

## How it works

- Cloudflare Pages serves this folder. index.html, app.css and app.js are the page: plain HTML, CSS and JavaScript, no build step.
- functions/api/ holds the Cloudflare Pages Functions, the only part that talks to GitHub. The browser never sees the GitHub token: it is a Cloudflare secret, GITHUB_TOKEN.
- Cloudflare Zero Trust (Access) asks for a login before anyone sees anything, and lets in only the founders' emails. The functions also check Access's signed login and the list in HQ_FOUNDERS on every request, and refuse anything else.
- lib/ holds the shared code: collect.js reads GitHub (REST only), build.js works out each agent's state with the same rules as Mission control (ops/dashboard/build.py), and validate.js checks every form.
- Data comes live from the GitHub REST API: Issues, heartbeats on the Status Issues (#4 to #9), pull requests, PAUSE files, ops/links.md, ops/decisions.md, agents/schedule.json, and Mission control's status.json on the dashboard branch. /api/status is cached for 60 seconds; /api/folders for 10 minutes.
- Times are Sydney time, the time of every schedule in agents/schedule.json.
- Waiting on you: an open pull request waits for Melvin, who reviews and merges every pull request (merges_pull_requests in agents/schedule.json), unless a human: label names someone else. An Issue waits for the founder in its human: label. Mission control does the same.

## The buttons

| Button | What it does on GitHub or Claude |
|---|---|
| RUNNING or PAUSED (Today) | Creates or deletes the file PAUSE on main: every agent stops at its next check |
| Pause or resume (an agent's card) | Creates or deletes `PAUSE-<name>` on main: that agent stops |
| Give work (an agent's card) | Opens an Issue labelled `agent:<name>` and priority:high or priority:normal |
| Run now (an agent's card) | Calls the agent's scheduled task API trigger if its two Cloudflare secrets are set; otherwise opens claude.ai/code/routines |
| Add something (Everything) | Opens an Issue `"File: <name>"` for the chief of staff, who adds the row to ops/links.md |

Every write says who pressed the button in the Issue or the commit message. HQ matches the email that Cloudflare Access signed to a name in the Cloudflare setting HQ_FOUNDERS, and writes only that name, never an email address. HQ_FOUNDERS is required: without it, or with an entry HQ cannot read, HQ stays locked.

## Look

- Colours, type, spacing and radius come from the company design system (brand/design-tokens.css in pull request #12, tokens version 1), confirmed as the theme by both founders on 4 Nov 2026. The values are copied into the top of app.css, because Cloudflare serves only hq/. If the design system changes, change it first, then app.css, check every text colour still reaches 4.5:1, and retake the screenshots.
- Fonts: assets/site-sans-latin.woff2 and assets/site-serif-semibold-latin.woff2, the website's cut-down copies of Source Sans 3 and Source Serif 4, renamed Site Sans and Site Serif because their licence reserves the name "Source" for the originals (site/assets/README.md in pull request #12 says how they were made). Their licence, the SIL Open Font License 1.1, is next to them (ofl-source-sans-3.txt, ofl-source-serif-4.txt). General information, not legal advice.
- The company name and logo stay out of this public repository until the domain is bought. HQ shows the name from the Cloudflare setting COMPANY_NAME (hq/SETUP.md, step 4), and "Founders only" without it. The header uses a plain HQ mark, not the logo.

## Files

- index.html, app.css, app.js: the page. assets/: the two fonts and their licence. sample/: made-up data, shown with ?sample=1 (for screenshots and trying the page before setup).
- functions/api/: status.js, folders.js, issue.js, pause.js, run.js.
- lib/: shared code, used by the functions (and time.js and config.js by the page too). The Company view (company/) runs exact copies of some of these files and of assets/, in company/lib/hq/ and company/assets/, so the two always agree: after changing one, run `node tests/copy-hq.mjs` in company/. Both test suites fail until the copies match.
- _headers and _routes.json: Cloudflare settings (security headers; only /api/* runs a function).
- tests/: run `npm test` in hq/ (Node.js 20 or newer). They use made-up GitHub responses and need no network. crosscheck-mission-control.py checks that HQ and Mission control agree; make-sample.mjs rebuilds sample/.
- screenshots/: each tab at phone and desktop width, made with tests/screenshots.mjs.

## Rules

- No patient data, no private person's name, phone or email, and no secrets on any page or in any form. The forms refuse text that looks like patient data or a token.
- Changes come through a pull request, like everything else: Adam builds HQ, and Melvin reviews and merges.
