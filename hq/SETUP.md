# HQ setup: the manual steps

Who: Adam, who has admin rights on the GitHub repository, about 30 minutes. Melvin then checks the last step on his own phone.

Do the steps in order. Nothing here costs money (see "What it costs" at the end), but Cloudflare asks for payment details once, in step 5, even for its free plan. A founder decides before entering them.

Never paste the GitHub token or a Run now token into GitHub, Slack, an email or a chat, including a Claude chat. They go only into Cloudflare.

## 1. Merge first

HQ is served from main. Melvin merges pull requests #1, #2, #3, #11 and the HQ pull request, in that order, checking after each merge that the next one's base is main. (Claude sessions opened them for Adam, and nobody merges their own.) Pull request #12, the website, does not need to come first.

## 2. Make the GitHub token

1. On github.com, open your photo, then Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.
2. Token name: `HQ on Cloudflare`. Expiration: 1 year. Put a reminder in your calendar a week before it ends.
3. Resource owner: `roulmediateam-byte`. Repository access: Only select repositories, then `fifteen-expert-hq`.
4. Repository permissions: Contents: Read and write. Issues: Read and write. Pull requests: Read-only. (Metadata: Read-only is added by itself.) Nothing else.
5. Generate the token and copy it. It starts with `github_pat_`. Keep the tab open for step 4.

## 3. Create the Cloudflare Pages project

1. Sign in at dash.cloudflare.com (a free account is enough).
2. Go to Workers & Pages, Create application, Pages, then Connect to Git (it may say "Import an existing Git repository").
3. Connect GitHub. When GitHub asks, install the Cloudflare Pages app on `roulmediateam-byte` with access to `fifteen-expert-hq` only.
4. Pick `fifteen-expert-hq` and press Begin setup.
5. Project name: `fifteen-expert-hq`. HQ's address is then https://fifteen-expert-hq.pages.dev. If Cloudflare gives a different address, use that one everywhere below, and change it in README.md and ops/links.md. The public website (site/, pull request #12) needs a second, separate Pages project: give that one another name, such as `fifteen-expert-site`, because Cloudflare offers the repository's name, `fifteen-expert-hq`, first.
6. Production branch: `main`.
7. Framework preset: None. Build command: `exit 0`. Build output directory: `/`. If the box refuses `/`, type a single full stop: `.`
8. Root directory (under Advanced): `hq`.
9. Save and Deploy. The first page will say HQ is locked. That is right until step 6.
10. In the project, open Settings and its build settings (called Builds, or Builds & deployments), then Branch control (Configure Preview deployments). Set Preview branches to None, and save. Agents push branches all day; with previews off, no branch ever runs its own copy of HQ.

## 4. Add the secrets

In the project, go to Settings, Variables and Secrets (older screens call it Environment variables), and add these for Production only (never for Preview):

| Name | Type | Value |
|---|---|---|
| `GITHUB_TOKEN` | Secret | the token from step 2 |
| `HQ_FOUNDERS` | Secret | each founder as Name:email, with a comma between founders |
| `COMPANY_NAME` | Text | optional: the company name HQ shows in its header (letters, digits and spaces, at most 40 characters) |

HQ_FOUNDERS looks like this, with the real addresses the founders sign in with: `Adam:adam@example.com, Melvin:melvin@example.com`.

- HQ needs it. Without it, or if HQ cannot read any one entry, HQ stays locked. A typo never lets more people in.
- It is a second lock: HQ refuses any other email, even if the login in step 5 lets it through.
- It gives the name HQ writes into Issues and commit messages. HQ writes the name only, never the email, so no email address reaches GitHub.

COMPANY_NAME keeps the company name out of the public repository: HQ shows it from this setting, and shows "Founders only" without it.

## 5. Turn on the login (Cloudflare Zero Trust)

1. In the Cloudflare dashboard, choose Zero Trust. The first time, pick a team name, for example `fifteen-expert`, so your team domain is `fifteen-expert.cloudflareaccess.com`. Choose the Free plan (US$0, up to 50 users). Cloudflare asks for payment details even for the Free plan; it does not charge them.
2. Back in Workers & Pages, open the HQ project, then Settings, General, and press Enable access policy. Cloudflare makes an Access application for the project.
3. Press Manage next to it (or go to Zero Trust, Access, Applications, and open that application, then Configure).
4. Under Public hostname, keep the row with `*` in the Subdomain box. It covers each deployment's own address, such as `1a2b3c4d.fifteen-expert-hq.pages.dev`, which runs HQ with the same secrets. Press Add public hostname (older screens: Add domain) and add a second row: Subdomain empty, Domain `fifteen-expert-hq.pages.dev`. Save. If saving gives an error, change the application name a little and save again.
5. Open the application's policy and set: Action Allow; Include, Emails: Adam's and Melvin's emails (the same as in HQ_FOUNDERS). Save. One-time PIN (a code sent by email) is the login method unless you add another.
6. In the same application, find the Application Audience (AUD) Tag (under Overview or Additional settings) and copy it.

## 6. Unlock HQ

1. Back in the Pages project, Settings, Variables and Secrets, add for Production:

| Name | Type | Value |
|---|---|---|
| `ACCESS_TEAM_DOMAIN` | Text | your team domain, for example `fifteen-expert.cloudflareaccess.com` |
| `ACCESS_AUD` | Text | the AUD tag from step 5 |

2. New settings reach HQ only after a new deployment: go to Deployments, open the latest one, and choose Retry deployment (it may be under Manage deployment).

HQ checks Cloudflare's signed login on every request. If ACCESS_TEAM_DOMAIN, ACCESS_AUD or HQ_FOUNDERS is missing or wrong, HQ stays locked and reads nothing from GitHub.

## 7. Optional: Run now buttons

Without these, Run now opens claude.ai/code/routines in a new tab, and you press Run now there. To make HQ's button start the run itself, for each agent you want:

1. On claude.ai/code/routines, open the agent's scheduled task, then Edit. In the Trigger row press +, choose API, copy the Fire URL, press Generate token and copy the token (it is shown once).
2. In the Pages project, add for Production: `ROUTINE_<NAME>_URL` (Text, the Fire URL) and `ROUTINE_<NAME>_TOKEN` (Secret, the token), where `<NAME>` is the agent's name in capitals with `_` for `-`: CHIEF_OF_STAFF, DESIGN, ENGINEER, REVIEWER, RESEARCH, SALES.
3. Retry the latest deployment, as in step 6.

Each task allows 30 starts an hour, and every run uses the Max plan's allowance like a scheduled run. To switch a button off again, delete its token on claude.ai/code/routines (Delete token).

## 8. Create the two priority labels

Give work labels each Issue priority:high or priority:normal. Create them once on github.com: Issues, Labels, New label: `priority:high` (colour B60205) and `priority:normal` (colour C5DEF5). ops/setup-labels.md has the same as commands.

## 9. Test each button once

1. On your phone, open https://fifteen-expert-hq.pages.dev. Cloudflare asks for your email and sends a code. HQ opens on Today. Melvin does the same on his phone.
2. In a private window, try an email that is not a founder's. Cloudflare must not let it in: no code arrives, or it says the email has no access. (This is the playbook's "nobody else can".)
3. In a private window, open a deployment's own address: in the Pages project, Deployments, open the latest one and copy its address (it looks like `https://1a2b3c4d.fifteen-expert-hq.pages.dev`). Cloudflare must ask for the email login there too. If the page opens without asking, redo step 5, part 4.
4. Agents, design, Give work: What to do `Make a placeholder homepage in site/ using plain colours`, Done when `site/index.html exists`, priority Normal, owner Adam. HQ shows the new Issue number. On GitHub it has the labels agent:design and priority:normal, and its last line names you. On HQ's Work board (press Refresh) it is in Ready for AI.
5. Agents, design, Pause. On GitHub, main now has a file PAUSE-design, committed as "[hq] Pause the design agent, by ...". The design card turns grey (paused). Press Resume: the file is gone.
6. Today, press RUNNING: main gets a file PAUSE and every agent shows paused. Press PAUSED to resume. Do this when no run is going.
7. Agents, any agent, Run now. Without step 7 it opens claude.ai/code/routines. With step 7 HQ says "Run started" with a link to the session; the agent's first heartbeat appears on its Status Issue within a few minutes.
8. Everything, Add something: name `Test link`, link `https://example.com`, area Ops. GitHub gets an Issue "File: Test link" labelled agent:chief-of-staff. Close it with a comment "test" so the chief of staff does not file it.
9. If you do not want the design agent to build the placeholder page, close the Issue from part 4 too.

Move on when the founders can open HQ, nobody else can (at either address), and each button has worked once (playbook Prompt 8c).

## What it costs

| Service | Plan | Limit | HQ's use (our estimate) | Cost |
|---|---|---|---|---|
| Cloudflare Pages | Free | Static pages free and unlimited; Functions share the Workers free quota of 100,000 requests a day; 500 builds a month | A few hundred function requests a day; one build per merge to main | US$0 |
| Cloudflare Zero Trust | Free | Up to 50 users | 2 founders | US$0 |
| GitHub | Free | 5,000 API calls an hour for the token | About 15 to 35 calls per refresh, at most one refresh a minute per open page | US$0 |
| Claude | Adam's Max plan | 30 Run now starts an hour per task | Only when a founder presses Run now | US$0 extra |

Expected total: US$0 a month.

Cloudflare's free plan also allows 50 outside calls and 10 ms of CPU time per request. HQ counts its GitHub calls to stay under 50. CPU, our estimate from tests on a computer: a normal refresh uses about 2 ms; the first refresh after a quiet spell uses about 10 to 14 ms, because the code starts cold. Cloudflare says it allows a Worker to run over the limit now and then, and stops it only when it goes over again and again. Before go-live, and again after a month, Adam checks Workers & Pages, the HQ project, Functions Metrics: the "CPU time per execution" chart, and "Exceeded resources" under Invocation statuses. If HQ keeps showing Cloudflare's Error 1102 ("Worker exceeded resource limits"), the fix is Workers Paid (US$5 a month): the founders decide before anyone changes plans.

## If something goes wrong

- "HQ is locked until ACCESS_TEAM_DOMAIN, ACCESS_AUD and HQ_FOUNDERS are set": do steps 4 and 6, then retry the deployment.
- "HQ is locked: HQ_FOUNDERS could not be read": one entry is not in the form Name:email. Fix it (step 4), then retry the deployment.
- "Your Cloudflare Access login is missing or has expired": reload the page. If it keeps happening, the address you opened is not behind the login; check step 5, part 4.
- "This email is not on HQ's list of founders": add the founder to HQ_FOUNDERS, then retry the deployment.
- "GitHub says the token is wrong or has expired": make a new token (step 2), replace GITHUB_TOKEN, retry the deployment.
- "GitHub refused ...: the token may be missing a permission": check the three permissions in step 2.
- "GitHub sent HQ elsewhere": the repository was renamed or moved. Add a Text setting HQ_REPO with its new owner/name (for example `roulmediateam-byte/new-name`), give the token access to it (step 2), then retry the deployment.
- Pause or resume fails with "GitHub could not do that": a rule on main now blocks direct changes. Do not loosen the rule for HQ's token. Pause by hand on github.com instead: Add file, Create new file, name it `PAUSE` (or `PAUSE-design` for one agent), and commit it to main. To resume, delete the file the same way. If the rule blocks you too, turn the agents' scheduled tasks off on claude.ai/code/routines.
- A Run now error about the token: make a new token for that task (step 7) and replace its secret.
- Cloudflare Error 1102: see "What it costs" above.

## Keep it safe

- The GitHub token can change Issues and files in this one repository. Cloudflare keeps it encrypted and never shows it again.
- Treat the token like the key to HQ itself. With it, someone could rewrite hq/ on main, and Cloudflare would then deploy their code with every HQ secret (the GitHub token and the Run now tokens). If you think it leaked: revoke it at once on github.com (Settings, Developer settings, Fine-grained tokens), make a new one (step 2), and check main's recent commits for changes to hq/ that nobody reviewed.
- Keep preview deployments off (step 3, part 10), and never add secrets to the Preview environment. Otherwise an agent's branch could run its own code with the token.
- Keep the `*` row in the Access application (step 5, part 4), so every deployment's own address stays behind the login.
- When a founder leaves, remove their email from the Access policy and from HQ_FOUNDERS, remove them from the Cloudflare account, and make a new GitHub token.
- While the repository is public, everything HQ writes is public too. The playbook's Step 5a says to keep the repository private. Making it private changes nothing in HQ: the token keeps working.

## Running HQ on a computer (Adam)

- Tests, no network needed: in hq/, run `npm test`. They include a cross-check that HQ and Mission control (ops/dashboard/build.py) agree.
- The page with made-up data: serve hq/ with any static server and open `/?sample=1`. To refresh the sample, run `node tests/make-sample.mjs`; to retake the screenshots, `node tests/screenshots.mjs <address>` (needs Playwright).
- The functions on your computer: `npx wrangler pages dev .` in hq/, with the settings in a file named `.dev.vars` (never committed; .gitignore covers it).
