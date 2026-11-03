# agents

Owner: Marvin. Each brief also names its agent's human owner.

What goes here: one brief per agent, named after its label without "agent:". Every brief has the same parts, in this order: Job, Human owner, When it runs, What it reads, Folders it may change, What it produces, Never, How it reports, Time box. The section "GitHub from a Claude session" below is shared by every brief.

| Brief | Label | Human owner | Runs (Sydney time) | Status |
|---|---|---|---|---|
| chief-of-staff.md | agent:chief-of-staff | Adam | Every day 6:30 am | On |
| design.md | agent:design | Adam | Every day 1:00 am | On |
| engineer.md | agent:engineer | Marvin | Every day 2:00 am | On |
| reviewer.md | agent:reviewer | Marvin | When a pull request is opened | On |
| research.md | agent:research | Adam | Mondays 3:00 am | On |
| sales.md | agent:sales | Melvin | Weekdays 4:00 am, from phase 5 | Off until phase 5 |

How they run: each agent is a Claude Code scheduled task on Adam's Claude account (claude.ai/code/routines), so everything it does on GitHub appears as Adam. The tag at the start of a pull request title, for example [design], says which agent opened it. Runs can start up to about 30 minutes late. Each brief holds its task's schedule and prompt, so a lost task can be recreated in minutes.

Every agent follows CLAUDE.md first. A brief can add limits but never remove a CLAUDE.md rule. A brief changes only through a reviewed pull request.

## GitHub from a Claude session

Agents run as Claude Code sessions. GitHub's GraphQL API is blocked there, so gh pr create, gh pr list, gh issue list and gh label list fail. Use GitHub's REST API through gh api instead. Tested from a Claude session on 4 Nov 2026: listing Issues and pull requests, creating labels and opening pull requests. Comments, labels on an Issue and closing an Issue use the same API but were not tested yet.

Set the repository once: `R=roulmediateam-byte/fifteen-expert-hq`

- Start time and today's date: `TZ=Australia/Sydney date "+%Y-%m-%d %H:%M"`. Note it first. Evidence gives the start and finish time, the minutes used of 30, and this run's session link if the session shows one.
- Your open Issues, oldest first (use your own label): `gh api "repos/$R/issues?state=open&labels=agent:design&sort=created&direction=asc" --jq '.[] | select(.pull_request | not) | "#\(.number) \(.title)"'`
- Open pull requests: `gh api "repos/$R/pulls?state=open&per_page=100" --jq '.[] | "#\(.number) \(.title) \(.head.ref)"'`
- Comments on an Issue or a pull request: `gh api "repos/$R/issues/N/comments"`
- Start a branch from main: `git fetch origin main && git checkout -b <branch> origin/main`
- Push, then record the branch so git knows it is pushed: `git push -u origin <branch>`, then `git fetch origin "+refs/heads/<branch>:refs/remotes/origin/<branch>"`
- Open the pull request: write the body to a file outside the repository, then `gh api "repos/$R/pulls" -X POST -f title="[agent] what" -f head=<branch> -f base=main -F body=@/tmp/pr-body.md`. Add `-F draft=true` when the work is unfinished.
- Comment: `gh api "repos/$R/issues/N/comments" -X POST -F body=@/tmp/comment.md`. Start every comment with your tag, for example "[chief-of-staff]", because everything an agent does on GitHub appears as Adam.
- Add a label: `gh api "repos/$R/issues/N/labels" -X POST -f "labels[]=agent:chief-of-staff"`
- Close an Issue: `gh api "repos/$R/issues/N" -X PATCH -f state=closed`
- The Mission control board is a GitHub Project, which needs GraphQL. Try it once per run; if it is refused, write "Board not reached" and move on.
