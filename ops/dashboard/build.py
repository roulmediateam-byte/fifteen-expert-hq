#!/usr/bin/env python3
"""Mission control for fifteen-expert-hq.

Rewrites the body of the Issue titled "Mission control" (label
mission-control) from:

- agents/schedule.json: each agent's owner, schedule (Sydney time), label
  and allowed folders;
- the heartbeat lines agents post on their Status Issues (label
  status-board), as agents/README.md, section "Heartbeat", describes;
- open pull requests and their reviews, open Issues, Issues closed in the
  last 7 days, commits on main in the last 7 days, and the PAUSE file.

It uses the GitHub REST API (plus one GraphQL call to pin the Issue, which
REST cannot do) and Python's standard library only. GitHub Actions runs it
(.github/workflows/mission-control.yml), so it costs no Claude usage.

By hand, printing the dashboard and changing nothing on GitHub:

    GITHUB_TOKEN=<token> python3 ops/dashboard/build.py --dry-run
"""

import argparse
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

REPO = os.environ.get("REPO") or os.environ.get("GITHUB_REPOSITORY") or "roulmediateam-byte/fifteen-expert-hq"
API = "https://api.github.com"
SYDNEY = ZoneInfo("Australia/Sydney")
SINGAPORE = ZoneInfo("Asia/Singapore")

TRUSTED = {"OWNER", "MEMBER", "COLLABORATOR"}  # only these authors count
INFRA_LABELS = {"status-board", "mission-control"}  # Issues that are not work
END_STATES = {"done", "blocked", "failed", "idle"}
STUCK_AFTER = timedelta(minutes=60)
OVERDUE_AFTER = timedelta(minutes=90)
OLD_PULL_REQUEST = timedelta(hours=48)
TIMELINE_SPAN = timedelta(days=3)
WEEK = timedelta(days=7)
DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
MAX_BODY = 64000  # GitHub allows 65,536 characters in an Issue body

DOTS = {"green": "\U0001F7E2", "yellow": "\U0001F7E1", "red": "\U0001F534", "grey": "\u26AA"}
COLOUR = {
    "working": "green", "done": "green", "idle": "green",
    "waiting on human": "yellow",
    "failed": "red", "blocked": "red", "overdue": "red", "stuck?": "red",
    "paused": "grey", "off": "grey", "no runs yet": "grey",
}
FOOTER = ("Built by .github/workflows/mission-control.yml. Do not edit this Issue by hand: "
          "it is rewritten every hour and after every heartbeat.")


# ---------------------------------------------------------------- small helpers

def parse_time(value):
    """ISO 8601 text to an aware datetime, or None."""
    if not value:
        return None
    try:
        moment = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def iso(moment):
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sydney(moment, with_year=False):
    """A short Sydney time such as 'Wed 4 Nov 06:30'."""
    if moment is None:
        return ""
    local = moment.astimezone(SYDNEY)
    year = f" {local.year}" if with_year else ""
    return f"{local:%a} {local.day} {local:%b}{year} {local:%H:%M}"


def cell(text):
    """Text that is safe inside a Markdown table cell or list item."""
    return str(text if text is not None else "").replace("|", "\\|").replace("\n", " ").strip()


def to_int(value):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def link(number):
    return f"[#{number}](https://github.com/{REPO}/issues/{number})"


def link_task(task):
    match = re.fullmatch(r"#(\d+)", (task or "").strip())
    if match:
        return link(match.group(1))
    return cell(task) or "none"


def hours_since(moment, now):
    return int((now - moment).total_seconds() // 3600)


# ---------------------------------------------------------------- GitHub REST

class GitHub:
    def __init__(self, token, repo):
        self.token = token
        self.repo = repo
        self.calls = 0

    def path(self, rest):
        return f"/repos/{self.repo}{rest}"

    def request(self, method, path, body=None, allow_404=False):
        url = path if path.startswith("https://") else API + path
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "fifteen-expert-hq-mission-control",
        }
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        if data is not None:
            headers["Content-Type"] = "application/json"
        self.calls += 1
        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
                return (json.loads(raw) if raw else None), response.headers.get("Link", "")
        except urllib.error.HTTPError as error:
            if allow_404 and error.code == 404:
                return None, ""
            detail = error.read().decode("utf-8", "replace")[:300]
            raise RuntimeError(f"GitHub {method} {path} failed: {error.code} {detail}") from None

    def get(self, path, allow_404=False):
        return self.request("GET", path, allow_404=allow_404)[0]

    def get_all(self, path, max_pages=5):
        items, url = [], path
        for _ in range(max_pages):
            data, link_header = self.request("GET", url)
            items.extend(data or [])
            following = re.search(r'<([^>]+)>;\s*rel="next"', link_header or "")
            if not following:
                break
            url = following.group(1)
        return items


# ---------------------------------------------------------------- heartbeats

HEARTBEAT_KEYS = ("agent", "state", "task", "start", "session", "pr", "minutes", "note")
KEY_RE = re.compile(r"(?:^|\s)(" + "|".join(HEARTBEAT_KEYS) + r")=")


def parse_heartbeat(body):
    """The fields of a '[heartbeat] key=value ...' line, or None."""
    lines = (body or "").strip().splitlines()
    if not lines or not lines[0].strip().startswith("[heartbeat]"):
        return None
    rest = lines[0].strip()[len("[heartbeat]"):]
    marks = list(KEY_RE.finditer(rest))
    fields = {}
    for index, mark in enumerate(marks):
        end = marks[index + 1].start() if index + 1 < len(marks) else len(rest)
        fields[mark.group(1)] = rest[mark.end():end].strip()
    if not fields.get("agent") or not fields.get("state"):
        return None
    fields["state"] = fields["state"].lower()
    return fields


def heartbeats_from(comments, agent):
    """Trusted heartbeats for one agent, oldest first."""
    beats = []
    for comment in comments:
        if comment.get("author_association") not in TRUSTED:
            continue
        fields = parse_heartbeat(comment.get("body"))
        if not fields or fields["agent"] != agent:
            continue
        fields["seen"] = parse_time(comment.get("created_at"))
        fields["url"] = comment.get("html_url", "")
        if fields["seen"]:
            beats.append(fields)
    beats.sort(key=lambda beat: beat["seen"])
    return beats


def runs_from(beats):
    """Pairs each 'working' heartbeat with the end heartbeat that follows it."""
    runs, current = [], None
    for beat in beats:
        state = beat["state"]
        if state == "working":
            if current:
                current["outcome"] = "no end"
                runs.append(current)
            current = {
                "start": parse_time(beat.get("start")) or beat["seen"], "seen": beat["seen"],
                "end": None, "outcome": None, "task": beat.get("task", ""),
                "session": beat.get("session", ""), "minutes": None, "pr": None, "note": "",
            }
        elif state in END_STATES or state == "paused":
            run = current or {"start": None, "seen": beat["seen"], "task": "", "session": ""}
            run.update(end=beat["seen"], outcome=state, pr=beat.get("pr"),
                       note=beat.get("note", ""), minutes=to_int(beat.get("minutes")))
            if not run.get("task") or run["task"] == "none":
                run["task"] = beat.get("task", "")
            if run["start"] is None:
                run["start"] = beat["seen"] - timedelta(minutes=run["minutes"] or 0)
            if run["minutes"] is None:
                run["minutes"] = max(0, int((run["end"] - run["start"]).total_seconds() // 60))
            runs.append(run)
            current = None
    if current:
        runs.append(current)
    return runs


# ---------------------------------------------------------------- schedules

def runs_on(days, day):
    if days == "daily":
        return True
    if days == "weekdays":
        return day.weekday() < 5
    if isinstance(days, list):
        return DAY_NAMES[day.weekday()] in {str(name).lower()[:3] for name in days}
    return False


def slots(schedule, start, end):
    """Scheduled run times from start to end, as Sydney times."""
    if not schedule or not schedule.get("time"):
        return []
    hour, minute = (int(part) for part in schedule["time"].split(":"))
    day = start.astimezone(SYDNEY).date() - timedelta(days=1)
    last_day = end.astimezone(SYDNEY).date() + timedelta(days=1)
    found = []
    while day <= last_day:
        if runs_on(schedule.get("days", "daily"), day):
            moment = datetime.combine(day, time(hour, minute), tzinfo=SYDNEY)
            if start <= moment <= end:
                found.append(moment)
        day += timedelta(days=1)
    return found


def next_run(schedule, now):
    upcoming = slots(schedule, now, now + timedelta(days=8))
    return upcoming[0] if upcoming else None


def last_due_run(schedule, now):
    """The latest scheduled run whose 90 minutes of grace are over."""
    past = slots(schedule, now - timedelta(days=8), now - OVERDUE_AFTER)
    return past[-1] if past else None


# ---------------------------------------------------------------- pull requests

def pr_agent(pr, names):
    """The agent that opened a pull request, from its [agent] title tag or claude/<agent>- branch."""
    match = re.match(r"\s*\[([a-z0-9-]+)\]", pr.get("title") or "")
    if match and match.group(1) in names:
        return match.group(1)
    branch = (pr.get("head") or {}).get("ref", "")
    for name in sorted(names, key=len, reverse=True):
        if branch == f"claude/{name}" or branch.startswith(f"claude/{name}-"):
            return name
    return None


def human_reviewed(pr):
    """True if a person reviewed or commented. Agent comments start with a [tag]."""
    if pr.get("_reviews"):
        return True
    for comment in pr.get("_comments", []):
        body = (comment.get("body") or "").lstrip()
        if comment.get("author_association") in TRUSTED and not body.startswith("["):
            return True
    return False


def reviewer_commented(pr):
    return any(comment.get("author_association") in TRUSTED
               and (comment.get("body") or "").lstrip().startswith("[reviewer]")
               for comment in pr.get("_comments", []))


def allowed(path, agent):
    """True if an agent may change this path (agents/schedule.json)."""
    if any(path.startswith(folder) for folder in agent.get("excluded_folders", [])):
        return False
    return any((place.endswith("/") and path.startswith(place)) or path == place
               for place in agent.get("allowed_folders", []))


# ---------------------------------------------------------------- reading GitHub

def collect(github, schedule, now):
    """Everything the dashboard needs, read through the REST API."""
    names = {agent["name"] for agent in schedule["agents"]}
    since = iso(now - WEEK)
    data = {"notes": []}

    data["paused"] = github.get(github.path("/contents/PAUSE?ref=main"), allow_404=True) is not None

    items = github.get_all(github.path("/issues?state=open&per_page=100"))
    data["open_issues"] = [item for item in items if "pull_request" not in item]
    closed = github.get_all(github.path(f"/issues?state=closed&since={since}&per_page=100"))
    data["closed_issues"] = [item for item in closed if "pull_request" not in item
                             and (parse_time(item.get("closed_at")) or now - 2 * WEEK) >= now - WEEK]

    data["status_issues"], data["heartbeats"] = {}, {}
    for issue in github.get_all(github.path("/issues?state=all&labels=status-board&per_page=100"), max_pages=2):
        match = re.fullmatch(r"Status:\s*(\S+)", (issue.get("title") or "").strip())
        if match and "pull_request" not in issue and match.group(1) in names:
            data["status_issues"][match.group(1)] = issue
    for name, issue in data["status_issues"].items():
        # The newest 200 comments are enough: chief of staff posts 2 a day.
        last_page = max(1, math.ceil(issue.get("comments", 0) / 100))
        comments = []
        for page in sorted({max(1, last_page - 1), last_page}):
            comments += github.get(github.path(f"/issues/{issue['number']}/comments?per_page=100&page={page}")) or []
        data["heartbeats"][name] = heartbeats_from(comments, name)

    data["open_prs"] = github.get_all(github.path("/pulls?state=open&per_page=100"), max_pages=3)
    for pr in data["open_prs"]:
        pr["_reviews"] = github.get_all(github.path(f"/pulls/{pr['number']}/reviews?per_page=100"), max_pages=2)
        pr["_comments"] = github.get_all(github.path(f"/issues/{pr['number']}/comments?per_page=100"), max_pages=3)

    data["merged_prs"], data["pr_files"] = [], {}
    try:
        recent = github.get(github.path("/pulls?state=closed&sort=updated&direction=desc&per_page=50")) or []
        data["merged_prs"] = [pr for pr in recent if (parse_time(pr.get("merged_at")) or now - 2 * WEEK) >= now - WEEK]
        for pr in data["open_prs"] + data["merged_prs"]:
            if pr_agent(pr, names):
                files = github.get_all(github.path(f"/pulls/{pr['number']}/files?per_page=100"), max_pages=3)
                data["pr_files"][pr["number"]] = sorted({entry["filename"] for entry in files}
                                                        | {entry["previous_filename"] for entry in files
                                                           if entry.get("previous_filename")})
    except RuntimeError as error:
        data["notes"].append(f"Could not check the files of agent pull requests: {error}")

    data["main_commits"] = []
    try:
        for commit in github.get_all(github.path(f"/commits?sha=main&since={since}&per_page=100"), max_pages=2):
            if not commit.get("parents"):
                continue  # the repository's first commit
            pulls = github.get(github.path(f"/commits/{commit['sha']}/pulls")) or []
            data["main_commits"].append({
                "sha": commit["sha"], "url": commit.get("html_url", ""),
                "message": (commit["commit"]["message"].splitlines() or [""])[0],
                "from_pr": any(pull.get("merged_at") for pull in pulls),
            })
    except RuntimeError as error:
        data["notes"].append(f"Could not check the commits on main: {error}")
    return data


# ---------------------------------------------------------------- the model

def overdue_reason(agent, beats, data, now):
    schedule = agent.get("schedule") or {}
    due = last_due_run(schedule, now)
    if due and not any(beat["seen"] >= due for beat in beats):
        return f"no heartbeat since the {sydney(due)} run"
    if schedule.get("on_pull_request"):
        missed = []
        for pr in data["open_prs"]:
            opened = parse_time(pr.get("created_at"))
            if opened is None or now - opened < OVERDUE_AFTER or reviewer_commented(pr):
                continue
            if not any(beat.get("task") == f"#{pr['number']}" and beat["seen"] >= opened for beat in beats):
                missed.append(f"#{pr['number']}")
        if missed:
            return "no review yet of " + ", ".join(missed)
    return ""


def agent_state(agent, runs, beats, data, names, now):
    """(state, reason), by the rules in agents/README.md, section Heartbeat."""
    if not agent.get("enabled", True):
        return "off", agent.get("enabled_note", "")
    if data["paused"]:
        return "paused", "PAUSE file on main"
    last = runs[-1] if runs else None
    if last and last["outcome"] is None:
        if now - last["seen"] < STUCK_AFTER:
            return "working", ""
        return "stuck?", f"working since {sydney(last['seen'])} with no end heartbeat"
    late = overdue_reason(agent, beats, data, now)
    if late:
        return "overdue", late
    if last and last["outcome"] in ("failed", "blocked"):
        return last["outcome"], last.get("note", "")
    if any(not pr.get("draft") and pr_agent(pr, names) == agent["name"] and not human_reviewed(pr)
           for pr in data["open_prs"]):
        return "waiting on human", "open pull request with no human review"
    if last:
        return ("idle" if last["outcome"] == "paused" else last["outcome"]), last.get("note", "")
    return "no runs yet", ""


def run_label(outcome, task):
    match = re.fullmatch(r"#(\d+)", (task or "").strip())
    what = f"task {match.group(1)}" if match else re.sub(r"[^A-Za-z0-9 .-]", " ", task or "")
    return re.sub(r"\s+", " ", f"{outcome} {what}").strip()


def timeline(schedule, runs_by_agent, now):
    """A Mermaid gantt chart of the runs in the last 3 days."""
    lines = ["```mermaid", "gantt", "    title Agent runs, last 3 days (Sydney time)",
             "    dateFormat YYYY-MM-DD HH:mm", "    axisFormat %a %H:%M"]
    count = 0
    for agent in schedule["agents"]:
        recent = [run for run in runs_by_agent.get(agent["name"], [])
                  if (run["end"] or now) >= now - TIMELINE_SPAN]
        if not recent:
            continue
        lines.append(f"    section {agent['name']}")
        for run in recent:
            outcome, start = run["outcome"], run["start"]
            end = run["end"] or now
            if outcome is None:
                outcome = "stuck" if now - run["seen"] >= STUCK_AFTER else "working"
                if outcome == "stuck":
                    end = start + STUCK_AFTER
            if end <= start:
                end = start + timedelta(minutes=1)
            tag = {"failed": "crit, ", "stuck": "crit, ", "no end": "crit, ",
                   "working": "active, ", "done": "done, ", "idle": "done, "}.get(outcome, "")
            begin, finish = start.astimezone(SYDNEY), end.astimezone(SYDNEY)
            lines.append(f"    {run_label(outcome, run.get('task'))} :{tag}"
                         f"{begin:%Y-%m-%d %H:%M}, {finish:%Y-%m-%d %H:%M}")
            count += 1
    lines.append("```")
    return lines if count else ["No runs in the last 3 days."]


def build_model(schedule, data, now):
    agents = schedule["agents"]
    names = {agent["name"] for agent in agents}
    rows, runs_by_agent = [], {}
    for agent in agents:
        beats = data["heartbeats"].get(agent["name"], [])
        runs = runs_from(beats)
        runs_by_agent[agent["name"]] = runs
        state, reason = agent_state(agent, runs, beats, data, names, now)
        last = runs[-1] if runs else None
        plan = agent.get("schedule") or {}
        if agent.get("enabled", True):
            upcoming = sydney(next_run(plan, now)) or "none"
            if plan.get("on_pull_request"):
                upcoming += " sweep, and on every pull request"
        else:
            upcoming = "off" + (f" ({agent['enabled_note']})" if agent.get("enabled_note") else "")
        minutes = ""
        if last and last["outcome"] is None:
            minutes = f"{int((now - last['seen']).total_seconds() // 60)} so far"
        elif last and last.get("minutes") is not None:
            minutes = str(last["minutes"])
        rows.append({
            "name": agent["name"], "owner": agent["owner"], "state": state, "reason": reason,
            "dot": DOTS[COLOUR.get(state, "grey")],
            "task": link_task(last["task"]) if last else "none",
            "last_start": sydney(last["start"]) if last else "",
            "minutes": minutes, "next_run": upcoming,
            "open_prs": [pr["number"] for pr in data["open_prs"] if pr_agent(pr, names) == agent["name"]],
        })

    founders = [founder["name"] for founder in schedule.get("founders", [])] or ["Adam", "Melvin", "Marvin"]
    by_label = {founder.get("label", "human:" + founder["name"].lower()): founder["name"]
                for founder in schedule.get("founders", [])}
    owners = {agent["name"]: agent["owner"] for agent in agents}
    waiting = {founder: [] for founder in founders}

    def add(founder, item, kind):
        opened = parse_time(item.get("created_at")) or now
        waiting.setdefault(founder, []).append({
            "number": item["number"], "title": cell(item.get("title")), "kind": kind,
            "hours": hours_since(opened, now)})

    for pr in data["open_prs"]:
        if pr.get("draft"):
            continue
        named = [by_label[label["name"]] for label in pr.get("labels", []) if label["name"] in by_label]
        agent = pr_agent(pr, names)
        for founder in named or [owners[agent] if agent else founders[0]]:
            add(founder, pr, "pull request")
    for issue in data["open_issues"]:
        for label in issue.get("labels", []):
            if label["name"] in by_label:
                add(by_label[label["name"]], issue, "Issue")
    for founder in waiting:
        waiting[founder].sort(key=lambda item: -item["hours"])

    work = [issue for issue in data["open_issues"]
            if not {label["name"] for label in issue.get("labels", [])} & INFRA_LABELS]
    board_labels = [agent["label"] for agent in agents] + list(by_label)
    board = {label: sum(1 for issue in work if label in {l["name"] for l in issue.get("labels", [])})
             for label in board_labels}
    closed = sum(1 for issue in data["closed_issues"]
                 if not {label["name"] for label in issue.get("labels", [])} & INFRA_LABELS)

    alerts = []
    for row in rows:
        if row["state"] in ("overdue", "stuck?", "failed"):
            alerts.append(f"{row['name']} is {row['state']}" + (f": {cell(row['reason'])}" if row["reason"] else ""))
    for agent in agents:
        if agent["name"] not in data["status_issues"]:
            alerts.append(f"{agent['name']} has no Status Issue (title \"Status: {agent['name']}\", label status-board)")
    for pr in data["open_prs"]:
        opened = parse_time(pr.get("created_at"))
        if opened and now - opened > OLD_PULL_REQUEST:
            alerts.append(f"{link(pr['number'])} has been open {hours_since(opened, now)} hours: {cell(pr.get('title'))}")
    for commit in data["main_commits"]:
        if not commit["from_pr"]:
            alerts.append(f"Commit [{commit['sha'][:7]}]({commit['url']}) on main did not come from a merged "
                          f"pull request: {cell(commit['message'])}")
    by_name = {agent["name"]: agent for agent in agents}
    for pr in data["open_prs"] + data["merged_prs"]:
        agent = pr_agent(pr, names)
        if not agent:
            continue
        outside = [path for path in data["pr_files"].get(pr["number"], []) if not allowed(path, by_name[agent])]
        if outside:
            more = f" and {len(outside) - 5} more" if len(outside) > 5 else ""
            alerts.append(f"{link(pr['number'])} from {agent} changes files outside its folders: "
                          f"{', '.join(outside[:5])}{more}")
    alerts += [cell(note) for note in data.get("notes", [])]

    local, singapore = now.astimezone(SYDNEY), now.astimezone(SINGAPORE)
    return {
        "updated": f"{sydney(now, with_year=True)} Sydney ({singapore:%H:%M} Singapore)",
        "updated_utc": iso(now), "paused": data["paused"], "agents": rows, "waiting": waiting,
        "timeline": timeline(schedule, runs_by_agent, now), "board": board,
        "closed_last_7_days": closed, "alerts": alerts, "sydney_date": f"{local:%Y-%m-%d}",
    }


# ---------------------------------------------------------------- the Issue body

def render(model):
    out = [f"Updated {model['updated']}", ""]
    out.append("# PAUSED (PAUSE file on main)" if model["paused"] else "# RUNNING")
    out += ["", "## Agents", "",
            "| | Agent | Owner | State | Current or last task | Last run start (Sydney) | Minutes | "
            "Next run (Sydney) | Open pull requests |",
            "|---|---|---|---|---|---|---|---|---|"]
    for row in model["agents"]:
        prs = ", ".join(link(number) for number in row["open_prs"]) or "none"
        out.append(f"| {row['dot']} | {row['name']} | {row['owner']} | {row['state']} | {row['task']} | "
                   f"{row['last_start'] or 'never'} | {row['minutes']} | {row['next_run']} | {prs} |")
    out += ["", "## Waiting on you"]
    for founder, items in model["waiting"].items():
        out += ["", f"**{founder}**", ""]
        out += [f"- {link(item['number'])} {item['title']} ({item['kind']}, {item['hours']} hours)"
                for item in items] or ["- Nothing waiting."]
    out += ["", "## Timeline", ""] + model["timeline"]
    out += ["", "## Board", "", "| Label | Open Issues |", "|---|---|"]
    out += [f"| {label} | {count} |" for label, count in model["board"].items()]
    out += ["", f"Issues closed in the last 7 days: {model['closed_last_7_days']}.", "", "## Alerts", ""]
    out += [f"- {DOTS['red']} {alert}" for alert in model["alerts"]] or ["- None."]
    out += ["", "---", FOOTER]
    body = "\n".join(out)
    if len(body) > MAX_BODY:
        body = body[:MAX_BODY] + "\n\n(Cut short to fit GitHub's size limit.)"
    return body


# ---------------------------------------------------------------- publishing

def publish(github, body):
    """Rewrites the Mission control Issue, creating it once if needed, and tries to pin it."""
    found = github.get(github.path("/issues?state=all&labels=mission-control&per_page=100")) or []
    issue = next((item for item in found if item.get("title") == "Mission control"
                  and "pull_request" not in item), None)
    if issue is None:
        issue, _ = github.request("POST", github.path("/issues"),
                                  {"title": "Mission control", "body": body, "labels": ["mission-control"]})
    else:
        change = {"body": body}
        if issue.get("state") != "open":
            change["state"] = "open"
        github.request("PATCH", github.path(f"/issues/{issue['number']}"), change)
    try_pin(github, issue)
    return issue["number"]


def try_pin(github, issue):
    """Pinning needs GraphQL. If it fails, pin the Issue by hand once."""
    owner, name = github.repo.split("/", 1)
    query = ("query($owner:String!,$name:String!){repository(owner:$owner,name:$name)"
             "{pinnedIssues(first:3){nodes{issue{number}}}}}")
    try:
        answer, _ = github.request("POST", API + "/graphql",
                                   {"query": query, "variables": {"owner": owner, "name": name}})
        nodes = (((answer or {}).get("data") or {}).get("repository") or {}).get("pinnedIssues", {}).get("nodes", [])
        if any(node["issue"]["number"] == issue["number"] for node in nodes):
            return
        mutation = "mutation($id:ID!){pinIssue(input:{issueId:$id}){issue{number}}}"
        answer, _ = github.request("POST", API + "/graphql",
                                   {"query": mutation, "variables": {"id": issue["node_id"]}})
        if (answer or {}).get("errors"):
            print("Could not pin the Mission control Issue; pin it by hand once:", answer["errors"][0].get("message"))
        else:
            print("Pinned the Mission control Issue.")
    except (RuntimeError, KeyError, TypeError) as error:
        print("Could not pin the Mission control Issue; pin it by hand once:", error)


def main(argv=None):
    here = Path(__file__).resolve()
    parser = argparse.ArgumentParser(description="Build the Mission control Issue.")
    parser.add_argument("--schedule", default=str(here.parents[2] / "agents" / "schedule.json"))
    parser.add_argument("--out", default="", help="folder for dashboard.md and state.json")
    parser.add_argument("--dry-run", action="store_true", help="print the dashboard and change nothing")
    args = parser.parse_args(argv)

    schedule = json.loads(Path(args.schedule).read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)
    github = GitHub(os.environ.get("GITHUB_TOKEN", ""), REPO)
    model = build_model(schedule, collect(github, schedule, now), now)
    body = render(model)
    if args.out:
        folder = Path(args.out)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "dashboard.md").write_text(body + "\n", encoding="utf-8")
        (folder / "state.json").write_text(json.dumps(model, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.dry_run:
        print(body)
        print(f"\n(dry run: {github.calls} API calls, nothing changed on GitHub)", file=sys.stderr)
        return 0
    number = publish(github, body)
    print(f"Updated the Mission control Issue (#{number}) with {github.calls} API calls.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
