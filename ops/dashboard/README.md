# ops/dashboard

Owner: Marvin.

What goes here: build.py, which rewrites Issue #10, "Mission control", and selftest.py, its offline checks with made-up data. Python standard library only.

How it runs: .github/workflows/mission-control.yml runs build.py every hour at minute 7, after every new heartbeat on a Status Issue (#4 to #9), when a pull request opens or closes, and by hand (Actions tab, Mission control, Run workflow). It uses GitHub Actions only, no Claude usage. Each run also saves dashboard.md and state.json to the branch named dashboard, so there is a history. Never merge that branch.

What it reads: agents/schedule.json, and through the GitHub REST API the heartbeats on the Status Issues, open pull requests with their reviews and comments, open Issues, Issues closed in the last 7 days, commits on main in the last 7 days, and whether PAUSE exists on main. The state rules are in agents/README.md, section "Heartbeat".

By hand:
- Check the rules offline: `python3 ops/dashboard/selftest.py`
- Print the dashboard without changing anything on GitHub: `GITHUB_TOKEN=<token> python3 ops/dashboard/build.py --dry-run`
