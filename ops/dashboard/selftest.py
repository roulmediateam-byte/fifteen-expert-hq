#!/usr/bin/env python3
"""Offline checks for build.py, with made-up data: no network, no GitHub.

Run: python3 ops/dashboard/selftest.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build  # noqa: E402

SYD = build.SYDNEY
NOW = datetime(2026, 11, 5, 10, 0, tzinfo=SYD).astimezone(timezone.utc)  # Thu 5 Nov, 10:00 Sydney
SCHEDULE = json.loads((HERE.parents[1] / "agents" / "schedule.json").read_text(encoding="utf-8"))
failures = []


def at(day, hour, minute):
    """A Sydney time on <day> November 2026, as ISO text."""
    return datetime(2026, 11, day, hour, minute, tzinfo=SYD).isoformat()


def beat(agent, line, when, author="OWNER"):
    return {"body": f"[heartbeat] agent={agent} {line}", "created_at": when, "author_association": author}


def pull(number, title, created, branch, labels=(), comments=()):
    return {"number": number, "title": title, "created_at": created, "head": {"ref": branch},
            "labels": [{"name": name} for name in labels], "draft": False,
            "_reviews": [], "_comments": list(comments)}


def data_with(paused=False, engineer_start=at(5, 9, 30)):
    comments = {
        "chief-of-staff": [beat("chief-of-staff", f"state=working task=digest start={at(5, 6, 32)} session=none", at(5, 6, 32)),
                           beat("chief-of-staff", "state=done task=digest pr=#20 minutes=13 note=digest and one filed item", at(5, 6, 45))],
        "design": [beat("design", f"state=working task=#14 start={at(5, 1, 5)} session=none", at(5, 1, 5)),
                   beat("design", "state=failed task=#14 pr=none minutes=15 note=could not read the tokens", at(5, 1, 20))],
        "engineer": [beat("engineer", f"state=working task=#15 start={engineer_start} session=none", engineer_start)],
        "reviewer": [beat("reviewer", f"state=working task=sweep start={at(5, 5, 2)} session=none", at(5, 5, 2)),
                     beat("reviewer", "state=idle task=sweep pr=none minutes=3 note=nothing new", at(5, 5, 5))],
        "research": [],
        "sales": [beat("sales", "state=done task=#99 pr=none minutes=5 note=from a stranger", at(5, 4, 0), author="NONE")],
    }
    return {
        "paused": paused,
        "status_issues": {agent["name"]: {"number": agent["status_issue"]} for agent in SCHEDULE["agents"]},
        "heartbeats": {name: build.heartbeats_from(items, name) for name, items in comments.items()},
        "open_prs": [
            pull(20, "[chief-of-staff] Digest 2026-11-05", at(5, 6, 45), "claude/chief-of-staff-2026-11-05"),
            pull(21, "[design] Hero section", at(4, 1, 30), "claude/design-14-hero",
                 comments=[{"body": "[reviewer] Changes needed", "author_association": "OWNER"}]),
            pull(22, "Founder notes", at(2, 9, 0), "notes", labels=["human:melvin"]),
        ],
        "merged_prs": [],
        "pr_files": {20: ["ops/digest/2026-11-05-digest.md"], 21: ["site/index.html", "site/demo/index.html"]},
        "open_issues": [
            {"number": 30, "title": "Check the lawyer quote", "created_at": at(4, 9, 0), "labels": [{"name": "human:adam"}]},
            {"number": 14, "title": "Hero section", "created_at": at(3, 9, 0), "labels": [{"name": "agent:design"}]},
            {"number": 4, "title": "Status: chief-of-staff", "created_at": at(4, 3, 0), "labels": [{"name": "status-board"}]},
        ],
        "closed_issues": [{"number": 31, "labels": [], "closed_at": at(4, 12, 0)}],
        "main_commits": [{"sha": "abc1234def", "message": "Edit README on main", "url": "", "from_pr": False}],
        "notes": [],
    }


def check(condition, message):
    if not condition:
        failures.append(message)


def states(model):
    return {row["name"]: row["state"] for row in model["agents"]}


model = build.build_model(SCHEDULE, data_with(), NOW)
body = build.render(model)
got = states(model)
check(got["chief-of-staff"] == "waiting on human", f"chief-of-staff: {got['chief-of-staff']}")
check(got["design"] == "failed", f"design: {got['design']}")
check(got["engineer"] == "working", f"engineer: {got['engineer']}")
check(got["reviewer"] == "overdue", f"reviewer: {got['reviewer']}")
check(got["research"] == "overdue", f"research: {got['research']}")
check(got["sales"] == "off", f"sales: {got['sales']}")
check(build.heartbeats_from(data_with()["heartbeats"]["sales"], "sales") == [], "an untrusted heartbeat was counted")

rows = {row["name"]: row for row in model["agents"]}
check(rows["chief-of-staff"]["next_run"] == "Fri 6 Nov 06:30", f"next run: {rows['chief-of-staff']['next_run']}")
check(rows["research"]["next_run"] == "Mon 9 Nov 03:00", f"research next run: {rows['research']['next_run']}")
check(rows["reviewer"]["next_run"].endswith("sweep, and on every pull request"), rows["reviewer"]["next_run"])
check(rows["chief-of-staff"]["minutes"] == "13", f"minutes: {rows['chief-of-staff']['minutes']}")
check(rows["engineer"]["minutes"] == "30 so far", f"engineer minutes: {rows['engineer']['minutes']}")
check(rows["chief-of-staff"]["dot"] == build.DOTS["yellow"] and rows["design"]["dot"] == build.DOTS["red"]
      and rows["engineer"]["dot"] == build.DOTS["green"] and rows["sales"]["dot"] == build.DOTS["grey"], "dot colours")

check(body.splitlines()[0] == "Updated Thu 5 Nov 2026 10:00 Sydney", body.splitlines()[0])
check("# RUNNING" in body, "status line")
check("section design" in body and "failed task 14 :crit, 2026-11-05 01:05, 2026-11-05 01:20" in body, "failed run is crit")
check("working task 15 :active, " in body, "working run is active")
check("done digest :done, 2026-11-05 06:32, 2026-11-05 06:45" in body, "done run")
alerts = "\n".join(model["alerts"])
check("site/demo/index.html" in alerts and "#21" in alerts, "out-of-folder alert")
check("abc1234" in alerts, "commit on main alert")
check("open 73 hours" in alerts and "#22" in alerts, "old pull request alert")
check("research is overdue" in alerts and "reviewer is overdue" in alerts and "design is failed" in alerts, "agent alerts")
check("no review yet of #20, #22" in alerts, "reviewer misses #20 and #22, not #21")
waiting = model["waiting"]
# Melvin reviews and merges every pull request (agents/schedule.json, merges_pull_requests).
check([item["number"] for item in waiting["Adam"]] == [30], f"Adam: {waiting['Adam']}")
check([item["number"] for item in waiting["Melvin"]] == [22, 21, 20], f"Melvin: {waiting['Melvin']}")
check(set(waiting) == {"Adam", "Melvin"}, f"founders: {list(waiting)}")
check(model["board"]["agent:design"] == 1 and model["board"]["human:adam"] == 1, f"board: {model['board']}")
check(model["closed_last_7_days"] == 1, "closed count")

stuck = states(build.build_model(SCHEDULE, data_with(engineer_start=at(5, 8, 30)), NOW))
check(stuck["engineer"] == "stuck?", f"stuck engineer: {stuck['engineer']}")
paused_model = build.build_model(SCHEDULE, data_with(paused=True), NOW)
paused = states(paused_model)
check(all(paused[name] == "paused" for name in paused if name != "sales") and paused["sales"] == "off", f"paused: {paused}")
check("# PAUSED" in build.render(paused_model), "paused status line")

fields = build.parse_heartbeat("[heartbeat] agent=design state=done task=#14 pr=#21 minutes=22 note=hero section drafted, needs a photo")
check(fields and fields["note"] == "hero section drafted, needs a photo" and fields["pr"] == "#21", f"parse: {fields}")
design = next(agent for agent in SCHEDULE["agents"] if agent["name"] == "design")
engineer = next(agent for agent in SCHEDULE["agents"] if agent["name"] == "engineer")
check(build.allowed("site/index.html", design) and not build.allowed("site/demo/index.html", design), "design folders")
check(build.allowed("site/demo/index.html", engineer) and not build.allowed("site/index.html", engineer), "engineer folders")
check(len(body) < build.MAX_BODY, "body size")

if failures:
    print("SELFTEST FAILED:", *failures, sep="\n  ")
    sys.exit(1)
print(f"selftest passed ({len(body)} characters of dashboard)")
