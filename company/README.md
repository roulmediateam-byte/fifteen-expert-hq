# company

Owner: Adam. Melvin reviews and merges every change. The founders share it with the people they choose.

What goes here: the Company view, a read-only web page that shows the whole company by department, at a link that asks for a passcode, on its own Cloudflare Pages project. Set it up once with SETUP.md. No patient data, ever.

## What it shows

- Top bar: the name, RUNNING or PAUSED, four numbers (roles working now, runs in the last 24 hours, pull requests waiting for review, work done in the last 7 days) and when it last updated, in Sydney time. The name comes from the Cloudflare setting COMPANY_NAME, and the page says "Company view" without it. No logo until the domain is bought.
- Org chart (home): the two founders, with their roles from TEAM.md, then a card per department from agents/departments.json: its lead, its mission and a chip per role. Each chip has an icon and a word: HQ's state words (lib/hq/build.js), plus Planned. Working chips pulse gently, and stay still if the viewer asks for less motion. Planned chips have a dashed outline and say when they switch on. Product and people roles are marked as such.
- Department page (tap a card): its mission and lead, its numbers with their source and date, its roles, a 7-day strip of runs per role, the open Issues for its agents and the last 10 merged pull requests by its agents.
- Feed: the latest 30 events (heartbeats, pull requests opened and merged, Issues closed), newest first, each tagged with its department.
- Heatmap: runs per department per day over 14 days. Each square's number is in the square, read out on tap, read by screen readers, and in a table.
- Help: what each word means, where the data comes from, and that the page is read-only.

## How it works

- Cloudflare Pages serves this folder (root directory company). index.html, app.css and app.js are the page: plain HTML, CSS and JavaScript, no build step.
- functions/_middleware.js is the passcode gate (rules in lib/gate.js). It runs in front of every path, the page's own files and /api/* included; only /robots.txt is open. There is no _routes.json, so it covers every file.
  - It answers only on the hostnames in COMPANY_VIEW_HOSTS, and gives 404 on any other, such as an older deployment's own address.
  - Without a valid cookie it returns only a small passcode page: no name, no data. The form posts the passcode, never puts it in the address, and redirects after.
  - The passcode is the secret DASHBOARD_PASSCODE, compared with crypto.subtle.timingSafeEqual as in Cloudflare's "Using timingSafeEqual" example, so a different length leaks nothing. A wrong passcode waits 1 second, then the page says "Wrong passcode".
  - The right passcode sets the cookie `__Host-company-view` for 7 days: HttpOnly, Secure, SameSite=Lax, Path=/, signed with HMAC SHA-256 under a key made from COOKIE_SECRET and the passcode together. Changing either signs everyone out. Lock, at the top of the page, clears the cookie.
  - If DASHBOARD_PASSCODE, COOKIE_SECRET or COMPANY_VIEW_HOSTS is missing, the passcode is under 20 characters, or COOKIE_SECRET is under 32, everything stays locked and the page names the setting to fix.
  - Every response gets the security headers of hq/_headers plus X-Robots-Tag: noindex; behind the gate, Cache-Control: private, no-store. The passcode is never logged or echoed.
- functions/api/view.js is the only part that calls GitHub: REST only, with a read-only fine-grained token in the Cloudflare secret GITHUB_TOKEN. It answers GET only and is cached for 60 seconds. It counts its GitHub calls and stops at 46, under Cloudflare's 50 per request (about 25 on a normal refresh).
- lib/view.js builds the data with HQ's own GitHub reading and state rules, so HQ, Mission control and the Company view always agree. lib/hq/ holds exact copies of the HQ files it needs, and assets/ the fonts and their licence from hq/assets/, because Cloudflare serves and bundles only company/, and a merge that changes only hq/ does not rebuild the Company view. After changing any of them in hq/, run `node tests/copy-hq.mjs` here (tests/shared-files.js lists them); the tests in both folders fail until the copies match. Never edit lib/hq/ by hand.
- lib/scrub.js hides money amounts, email addresses and phone numbers in every text that comes from GitHub, and hides a whole text that looks like patient data. lib/words.js holds each status word, its icon and what it means.
- Data, read live from GitHub: agents/schedule.json (on or off), agents/departments.json (departments, roles, numbers), ops/kpis.json (numbers only a founder knows), TEAM.md (the founders' roles), heartbeats on the Status Issues (14 days), open and recently closed Issues and pull requests, the PAUSE files on main, and the dated files in ops/digest/ and research/.
- Read-only: nothing on the page changes GitHub or Claude. Links open GitHub. The buttons stay in HQ, behind the founders' email login.

## Files

- index.html, app.css, app.js: the page. robots.txt: disallows everything. _headers: Cloudflare's headers for static files, the same as the gate's.
- functions/: _middleware.js (the gate) and api/view.js (the data).
- lib/: gate.js, view.js, scrub.js, words.js, and hq/ (copies of hq/lib/ files).
- assets/: the fonts Site Sans and Site Serif, and their licence (SIL Open Font License 1.1; general information, not legal advice).
- sample/view.json: made-up data, shown after the passcode with `?sample=1`. `npm run sample` rebuilds it.
- screenshots/: the passcode page, org chart, a department, the feed and the heatmap at phone (390 px) and desktop (1280 px) width, made with `npm run screenshots`.
- tests/: `npm test` (Node.js 20 or newer, no network). `npm run check-local` runs the view in Cloudflare's local runtime against a made-up GitHub and checks the gate. copy-hq.mjs, make-sample.mjs, screenshots.mjs, fake-github-server.mjs and wrangler.mjs are the tools behind them.
- package.json: wrangler, pinned, only for running the view on a computer. Cloudflare needs no packages to deploy it.

## Rules

- Treat everything on the page as public, because a passcode gets forwarded: no patient data, no private person's name, phone or email, no money amounts and no secrets.
- Never write the company name, logo or domain, the Cloudflare project's name or the page's address in this repository (CLAUDE.md). The founders share the address privately.
- Changes come through a pull request, like everything else: Adam builds the Company view, and Melvin reviews and merges.
