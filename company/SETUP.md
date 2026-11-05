# Company view setup: the manual steps

Who: Adam, who has admin rights on the GitHub repository and the Cloudflare account, about 30 minutes. Melvin then checks it on his own phone.

Do the steps in order. Nothing here costs money (see "What it costs" at the end).

Never paste the GitHub token, the passcode or the cookie secret into GitHub, Slack, an email or a chat, including a Claude chat. They go only into Cloudflare and your password manager. Keep the Cloudflare project's name and the page's address out of GitHub too: the founders share the address privately.

## 1. Merge first

The Company view is served from main. Melvin merges pull requests #1, #2, #3, #11 and #13 (HQ), then the pull request "[setup] Departments and the Company view", in that order, checking after each merge that the next one's base is main. (Claude sessions opened them for Adam, and nobody merges their own.)

## 2. Make the read-only GitHub token

1. On github.com, open your photo, then Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.
2. Token name: `Company view on Cloudflare`. Expiration: 1 year. Put a reminder in your calendar a week before it ends.
3. Resource owner: `roulmediateam-byte`. Repository access: Only select repositories, then `fifteen-expert-hq`.
4. Repository permissions: Contents: Read-only. Issues: Read-only. Pull requests: Read-only. (Metadata: Read-only is added by itself.) Nothing else: the Company view never writes.
5. Generate the token and copy it. It starts with `github_pat_`. Keep the tab open for step 4.

Why a token for a public repository: GitHub allows 60 calls an hour without one, and 5,000 with one.

## 3. Create the Cloudflare Pages project

1. Sign in at dash.cloudflare.com (the same free account as HQ).
2. Go to Workers & Pages, Create application, Pages, then Connect to Git (it may say "Import an existing Git repository").
3. If GitHub asks, install the Cloudflare Pages app on `roulmediateam-byte` with access to `fifteen-expert-hq` only. (HQ's setup may have done this already.)
4. Pick `fifteen-expert-hq` and press Begin setup.
5. Project name: a name of your own that ends with 8 or more random letters and digits from your password manager, so the address is hard to guess. Keep the company name out of it until the domain is bought. Save the name and the address in your password manager, never in GitHub.
6. Production branch: `main`.
7. Framework preset: None. Build command: `exit 0`. Build output directory: `/`. If the box refuses `/`, type a single full stop: `.`
8. Root directory (under Advanced): `company`.
9. Optional, under Environment variables on the same screen: `SKIP_DEPENDENCY_INSTALL` = `1`. The Company view needs no packages to deploy; without this, each build first installs wrangler, which is only for running it on a computer. Nothing else changes.
10. Save and Deploy. The first page says the view is locked and names the settings it needs. That is right until step 4.
11. In the project, open Settings and its build settings (called Builds, or Builds & deployments), then Branch control (Configure Preview deployments). Set Preview branches to None, and save. Agents push branches all day; with previews off, no branch ever runs its own copy.
12. In the same build settings, find Build watch paths. Include paths: `company/*` and nothing else. Exclude paths: none. Save. Then a merge that changes only other folders skips this project's build, so the 500 free builds a month last. After the next such merge, check that Deployments shows it was skipped. Set HQ to `hq/*` the same way (hq/SETUP.md, step 3).

## 4. Add the settings

In the project, go to Settings, Variables and Secrets (older screens call it Environment variables), and add these for Production only (never for Preview):

| Name | Type | Value |
|---|---|---|
| `GITHUB_TOKEN` | Secret | the token from step 2 |
| `DASHBOARD_PASSCODE` | Secret | 4 or more random words from your password manager, at least 20 characters |
| `COOKIE_SECRET` | Secret | 32 or more random characters from your password manager |
| `COMPANY_VIEW_HOSTS` | Text | the project's address from step 3, without `https://` and without a slash at the end |
| `COMPANY_NAME` | Text | optional: the name the page shows (letters, digits, spaces and & . ' -, at most 40 characters). Without it, the page says "Company view" |

Then go to Deployments, open the latest one, and choose Retry deployment (it may be under Manage deployment). New settings reach the page only after a new deployment.

- If DASHBOARD_PASSCODE, COOKIE_SECRET or COMPANY_VIEW_HOSTS is missing, if the passcode is under 20 characters, or if COOKIE_SECRET is under 32, everything stays locked and the page names the setting to fix. A typo never opens it.
- The page answers only at the addresses in COMPANY_VIEW_HOSTS. Every other address, such as an older deployment's own address, gets "Not found". If the page later moves to an address on the company's own domain, add it with a comma.

## 5. Test it

1. In a private window, open the address. Only the passcode box shows, with no company name and no data.
2. Type a wrong passcode. After about a second the page says "Wrong passcode".
3. Type the right one. The org chart opens. Open a department, then Feed, Heatmap (tap a square to read its number) and Help.
4. Press Lock, at the top. The passcode box comes back.
5. Open the address with `/robots.txt` at the end. It says `Disallow: /`.
6. In the project, Deployments, open an older deployment and its own address. It must say "Not found". If it opens the page, COMPANY_VIEW_HOSTS has more than the project's address in it.
7. Melvin opens the link on his phone, from an email, with the passcode sent to him another way.
8. After a few days: Workers & Pages, the project, Functions Metrics (see "What it costs").

## 6. Share it

1. Send the link one way, such as email, and the passcode another, such as a text message or in person. Never both in one message, and never in GitHub, an Issue or a pull request: a public link invites floods of guesses.
2. Add each person to the private list of who has it, such as a note in Adam's password manager. Never in this repository.
3. Remind them: treat everything on the page as public, because a passcode gets forwarded.

## 7. Change the passcode

Every 3 months, and whenever someone comes off the list:

1. Make a new passcode in your password manager: 4 or more random words, at least 20 characters.
2. In the project, Settings, Variables and Secrets, Production: edit `DASHBOARD_PASSCODE`.
3. Deployments, the latest one, Retry deployment.

That signs everyone out at once, because each cookie is signed with the passcode. Then send the new passcode, the same way as in step 6, to the people who keep access. Changing `COOKIE_SECRET` also signs everyone out.

## What it costs

| Service | Plan | Limit | The Company view's use (our estimate) | Cost |
|---|---|---|---|---|
| Cloudflare Pages | Free | 500 builds a month; Functions share the Workers free quota of 100,000 requests a day per account, with HQ | Every file passes the gate, so one visit is about 10 function requests; one build per merge that changes company/ | US$0 |
| GitHub | Free | 5,000 API calls an hour per GitHub user, shared with HQ's token and anything else acting as Adam | About 25 calls per refresh, at most one refresh a minute per running copy, thanks to the 60-second cache | US$0 |

Expected total: US$0 a month. An address on the company's own domain needs the domain, about US$10 to US$20 a year (our estimate), later.

- Cloudflare's free plan also allows 50 outside calls and 10 ms of CPU time per request. The Company view counts its GitHub calls and stops at 46. CPU, our estimate from tests on a computer with made-up data: each file through the gate uses well under 1 ms; building the data uses about 5 to 13 ms, at most once a minute per running copy, and more after a quiet spell, because the code starts cold. Cloudflare says it allows a Worker to run over the limit now and then. Before go-live, and again after a month, check Workers & Pages, the project, Functions Metrics: "CPU time per execution", and "Exceeded resources" under Invocation statuses. If the page keeps showing Cloudflare's Error 1102 ("Worker exceeded resource limits"), the fix is Workers Paid (US$5 a month): the founders decide before anyone changes plans.
- If someone floods the passcode page, the 100,000 requests a day can run out for HQ and the Company view alike: both show Cloudflare's error 1027 until the count resets at midnight UTC (11 am Sydney during daylight saving). The 1-second wait does not stop many guesses sent at once. Our estimate: unlikely while the link stays out of GitHub. If it happens, move the Company view to a second free Cloudflare account, so HQ keeps its own quota, or choose Workers Paid if the founders agree.

## If something goes wrong

- "Locked" with a setting named: add or fix that setting (step 4), then retry the deployment.
- "Not found" at the right address: COMPANY_VIEW_HOSTS must hold exactly that address, without `https://`. Fix it, then retry the deployment.
- "GitHub says the token is wrong or has expired": make a new token (step 2), replace GITHUB_TOKEN, retry the deployment.
- "GitHub refused ...: the token may be missing a permission": check the three permissions in step 2.
- "GitHub's hourly limit for this token is used up": it works again after the reset, within the hour.
- "GitHub sent ... elsewhere": the repository was renamed or moved. Add a Text setting HQ_REPO (the same name HQ uses) with its new owner/name, give the token access to it (step 2), then retry the deployment.
- The numbers look old: the data is cached for 60 seconds and the page refreshes every 2 minutes. Reload the page.
- Cloudflare Error 1102 or 1027: see "What it costs".

## Keep it safe

- The token can only read this one repository, but treat it as a secret. If you think it leaked, revoke it at once on github.com (Settings, Developer settings, Fine-grained tokens) and make a new one (step 2).
- Keep preview deployments off (step 3, part 11), and never add settings to the Preview environment.
- Never write the passcode, the cookie secret, the project's name or the page's address in GitHub, an Issue or a pull request.
- The page is read-only on purpose. HQ's buttons pause agents and open Issues, and HQ records which founder pressed each one, from the email login; a shared passcode cannot say who pressed. So the buttons stay in HQ.
- While the repository is public, everything the Company view shows is public on GitHub too.

## Running it on a computer (Adam)

- Tests, no network needed: in company/, run `npm test`. Run `npm test` in hq/ too: both check that the copies of HQ's code match.
- In company/, run `npm install` once (it installs wrangler 4.151.3, pinned), then `npm run check-local`: it runs the view in Cloudflare's local runtime against a made-up GitHub and makes the checks of step 5 by itself.
- `npm run screenshots` retakes company/screenshots/ through the real passcode gate (needs Playwright).
- The page with made-up data: after the passcode, open `/?sample=1`. `npm run sample` rebuilds company/sample/view.json.
- By hand: `npx wrangler pages dev .` in company/, with the settings in a file named `.dev.vars` (never committed; .gitignore covers it). To use made-up data, run `node tests/fake-github-server.mjs` and add `GITHUB_API=http://127.0.0.1:<its port>`, `GITHUB_TOKEN=test-github-token` and `COMPANY_VIEW_HOSTS=127.0.0.1` to `.dev.vars`.
