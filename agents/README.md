# agents

Owner: Adam. Each brief also names its agent's human owner.

What goes here: one brief per agent, named after its label without "agent:". Every brief has the same parts, in this order: Job, Human owner, When it runs, What it reads, Folders it may change, What it produces, Never, How it reports, Time box.

| Brief | Label | Human owner | Runs (Sydney time) | Status |
|---|---|---|---|---|
| chief-of-staff.md | agent:chief-of-staff | Adam | Every day 6:30 am | On |
| design.md | agent:design | Adam | Every day 1:00 am | On |
| engineer.md | agent:engineer | Adam | Every day 2:00 am | On |
| reviewer.md | agent:reviewer | Adam | When a pull request is opened | On |
| research.md | agent:research | Adam | Mondays 3:00 am | On |
| sales.md | agent:sales | Melvin | Weekdays 4:00 am, from phase 5 | Off until phase 5 |

How they run: each agent is a Claude Code scheduled task on Adam's Claude account (claude.ai/code/routines), so everything it does on GitHub appears as Adam. The tag at the start of a pull request title, for example [design], says which agent opened it. Runs can start up to about 30 minutes late. Each brief holds its task's schedule and prompt, so a lost task can be recreated in minutes.

Every agent follows CLAUDE.md first. A brief can add limits but never remove a CLAUDE.md rule. A brief changes only through a reviewed pull request.
