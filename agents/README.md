# agents

Owner: Adam. Each brief also names its agent's human owner.

What goes here: one brief per agent, named after its label without "agent:". Every brief has the same parts, in this order: Job, Human owner, When it runs, What it reads, Folders it may change, What it produces, Never, How it reports, Time box. The section "GitHub from a Claude session" below is shared by every brief.

| Brief | Department | Label | Human owner | Runs (Sydney time) | On or off | Status Issue | May change |
|---|---|---|---|---|---|---|---|
| chief-of-staff.md | Operations | agent:chief-of-staff | Adam | Every day 6:30 am | On | #4 | ops/digest/, new rows in ops/links.md and ops/decisions.md, the keys a File: Issue names in ops/kpis.json, filed items in yc/, brand/, design/, research/, sales/, finance/, legal/ |
| design.md | Brand and Marketing | agent:design | Adam | Every day 1:00 am | On | #5 | site/ (not site/demo/), design/, brand/ |
| engineer.md | Engineering | agent:engineer | Adam | Every day 2:00 am | On | #6 | prototype/, site/demo/ |
| reviewer.md | Engineering | agent:reviewer | Adam | When a pull request is opened, and every day 5:00 am | On | #7 | nothing (comments only) |
| research.md | Research and Insights | agent:research | Adam | Mondays 3:00 am | On | #8 | research/ |
| sales.md | Sales and Customers | agent:sales | Melvin | Weekdays 4:00 am, from phase 5 | Off until phase 5 | #9 | sales/ |

Departments: agents/departments.json groups every role into seven departments, each led by a founder: Operations, Engineering, Brand and Marketing, Sales and Customers, Claims Operations (Melvin), Research and Insights, and Finance and Legal (Adam, with Melvin for privacy); the rest are Adam's. It also lists the roles that are not on yet, each with when it switches on: the planned agents marketing, customer success, data analyst, finance, legal and contracts, and compliance monitor; the appeal drafter, which is the product's own AI and works only inside the claims system; and the trained reviewers, who are people. An agent's on or off comes only from agents/schedule.json. When a role is added or moved, change agents/departments.json, this table and agents/schedule.json together; company/tests/ checks that every agent in agents/schedule.json is in exactly one department. The Company view (company/README.md) shows the departments, their numbers (from ops/kpis.json and GitHub) and every role's state.

How they run: each agent is a Claude Code scheduled task on Adam's Claude account (claude.ai/code/routines), so everything it does on GitHub appears as Adam. The tag at the start of a pull request title, for example [design], says which agent opened it. Runs can start up to about 30 minutes late. Each brief holds its task's schedule and prompt, so a lost task can be recreated in minutes. agents/schedule.json holds the same schedules, owners, labels and folders for Mission control (Issue #10), for HQ (hq/) and for the Company view (company/): change it together with the brief. Melvin reviews and merges every pull request, because they all appear as Adam and nobody merges their own; Mission control and HQ list an open pull request under Melvin unless a human: label names someone else (merges_pull_requests in agents/schedule.json).

HQ, the founders' private dashboard (hq/README.md), shows every agent and has three buttons per agent: Give work (opens an Issue with the agent's label and priority:high or priority:normal), Run now (starts the agent's scheduled task through its API trigger) and Pause or resume (creates or deletes the file `PAUSE-<name>` on main).

Every agent follows CLAUDE.md first. A brief can add limits but never remove a CLAUDE.md rule. A brief changes only through a reviewed pull request.

## GitHub from a Claude session

Agents run as Claude Code sessions. GitHub's GraphQL API is blocked there, so gh pr create, gh pr list, gh issue list and gh label list fail. Use GitHub's REST API through gh api instead. Tested from a Claude session on 4 Nov 2026: listing Issues and pull requests, creating labels and opening pull requests. Comments, labels on an Issue and closing an Issue use the same API but were not tested yet.

Set the repository once: `R=roulmediateam-byte/fifteen-expert-hq`

- Start time and today's date: `TZ=Australia/Sydney date "+%Y-%m-%d %H:%M"`. Note it first. Evidence gives the start and finish time, the minutes used of 30, and this run's session link if the session shows one.
- Check for PAUSE, at the start and between steps (use your own name): `gh api "repos/$R/contents?ref=main" --jq '.[].name' | grep -x -E 'PAUSE|PAUSE-design'`. Any output means stop (CLAUDE.md rule 3). It reads main on GitHub, so it also sees a PAUSE file added after your run began.
- Your open Issues, oldest first (use your own label): `gh api "repos/$R/issues?state=open&labels=agent:design&sort=created&direction=asc" --jq '.[] | select(.pull_request | not) | "#\(.number) \(.title)"'`
- Only the high-priority ones: the same command with `labels=agent:design,priority:high` (a comma means both labels).
- Open pull requests: `gh api "repos/$R/pulls?state=open&per_page=100" --jq '.[] | "#\(.number) \(.title) \(.head.ref)"'`
- Comments on an Issue or a pull request: `gh api "repos/$R/issues/N/comments"`
- Start a branch from main, always named claude/... (CLAUDE.md rule 1): `git fetch origin main && git checkout -b claude/<agent>-<issue-number>-<topic> origin/main`
- Push, then record the branch so git knows it is pushed: `git push -u origin <branch>`, then `git fetch origin "+refs/heads/<branch>:refs/remotes/origin/<branch>"`
- Open the pull request: write the body to a file outside the repository, then `gh api "repos/$R/pulls" -X POST -f title="[agent] what" -f head=<branch> -f base=main -F body=@/tmp/pr-body.md`. Add `-F draft=true` when the work is unfinished.
- Comment: `gh api "repos/$R/issues/N/comments" -X POST -F body=@/tmp/comment.md`. Start every comment with your tag, for example "[chief-of-staff]", because everything an agent does on GitHub appears as Adam.
- Add a label: `gh api "repos/$R/issues/N/labels" -X POST -f "labels[]=agent:chief-of-staff"`
- Close an Issue: `gh api "repos/$R/issues/N" -X PATCH -f state=closed`
- The Mission control board is a GitHub Project, which needs GraphQL. Try it once per run; if it is refused, write "Board not reached" and move on.

## Picking work

Founders give work as Issues: with HQ's Give work button, or by opening an Issue with the agent's label. HQ adds priority:high or priority:normal. Each run takes one item, in this order:

1. Its own open pull request with a "[reviewer] Changes needed" comment or a founder asking for a change: fix that one, on the same branch.
2. Otherwise the oldest open Issue with its agent label and priority:high, with no open pull request.
3. Otherwise the oldest open Issue with its agent label and no open pull request (priority:normal, or no priority label).

HQ's Work board shows the same order in its Ready for AI column. The Mission control board (a GitHub Project) cannot be read from a Claude session, because it needs GraphQL, so agents pick by labels, as above.

## Heartbeat

Every agent reports on its own Status Issue (label status-board), so Issue #10, Mission control, can show what each one is doing: chief-of-staff #4, design #5, engineer #6, reviewer #7, research #8, sales #9.

1. At the very start of each run, note the time with `TZ=Australia/Sydney date -Iseconds`, then check for PAUSE and `PAUSE-<name>` (the command above).
2. If PAUSE or `PAUSE-<name>` exists, post this one line and stop (CLAUDE.md rule 3), naming the file you found in note:
   `[heartbeat] agent=<name> state=paused task=none pr=none minutes=0 note=PAUSE file on main` (or `note=PAUSE-<name> file on main`)
3. Otherwise post exactly one line, then start work:
   `[heartbeat] agent=<name> state=working task=<#issue or short text> start=<ISO time with offset> session=<session link>`
4. At the very end of each run, post exactly one line:
   `[heartbeat] agent=<name> state=<done|blocked|failed|idle> task=<#issue> pr=<#pr or none> minutes=<number> note=<under 15 words>`

- done: the work is finished and its pull request is open. blocked: a human must act first (say who in note). failed: something broke. idle: there was nothing to do.
- Values have no spaces, except note: write task=weekly-watch, not task=weekly watch. If the session shows no link, write session=none.
- Post a heartbeat with your own Status Issue number, for example: `gh api "repos/$R/issues/5/comments" -X POST -f body="[heartbeat] agent=design state=working task=#14 start=2026-11-05T01:04:12+11:00 session=none"`
- Never put anything else in Status Issues, and never close them.
- The dashboard trusts heartbeats only from the repository owner or collaborators, and only on the agent's own Status Issue. Its states: working (the last heartbeat is state=working and under 60 minutes old), stuck? (state=working and older), overdue (no heartbeat within 90 minutes after a scheduled run), waiting on human (an open pull request from the agent that no human has reviewed or commented on), done, idle, blocked, failed, paused (PAUSE, or `PAUSE-<name>` for that agent, on main) and off (enabled is false in agents/schedule.json). HQ uses the same rules.
- Two things share the name Mission control: Issue #10 is the dashboard; the Mission control board is the GitHub Project with the columns Inbox, Ready for AI, AI working, Needs human and Done.
