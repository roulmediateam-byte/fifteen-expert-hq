# ops/dashboard

Owner: Adam.

What goes here: build.py, which rewrites Issue #10, "Mission control", and selftest.py, its offline checks with made-up data. Python standard library only.

How it runs: .github/workflows/mission-control.yml runs build.py every hour at minute 7, after every new heartbeat on a Status Issue (#4 to #9), when a pull request opens or closes, and by hand (Actions tab, Mission control, Run workflow). It uses GitHub Actions only, no Claude usage. Each run also saves dashboard.md and status.json (the same data as JSON) to the branch named dashboard, so there is a history. HQ (hq/) reads status.json from there for two slow checks: commits on main that did not come from a pull request, and agent pull requests that change files outside their folders. Never merge that branch.

What it reads: agents/schedule.json, and through the GitHub REST API the heartbeats on the Status Issues, open pull requests with their reviews and comments, open Issues, Issues closed in the last 7 days, commits on main in the last 7 days, and the PAUSE files on main (PAUSE stops every agent, `PAUSE-<name>` one agent). The state rules are in agents/README.md, section "Heartbeat". HQ's stop switch commits PAUSE files straight to main with a message starting "[hq]"; such a commit raises no alert if it changed nothing but PAUSE files.

By hand:
- Check the rules offline: `python3 ops/dashboard/selftest.py`
- Print the dashboard without changing anything on GitHub: `GITHUB_TOKEN=<token> python3 ops/dashboard/build.py --dry-run`
