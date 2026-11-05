#!/usr/bin/env python3
"""Cross-check for hq/tests/status.test.js: feeds the same made-up GitHub
responses to Mission control (ops/dashboard/build.py) and prints the states
and waiting lists it works out, so HQ and Mission control can be compared.

Input on stdin: {"now": ISO time, "repo": the fake repository from helpers.js}.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops" / "dashboard"))
import build  # noqa: E402


def number_of(comment):
    match = re.search(r"/issues/(\d+)$", comment.get("issue_url", ""))
    return int(match.group(1)) if match else None


def main():
    payload = json.load(sys.stdin)
    now = build.parse_time(payload["now"])
    repo = payload["repo"]
    schedule = json.loads(repo["files"]["agents/schedule.json"])
    names = {agent["name"] for agent in schedule["agents"]}
    root = [entry["name"] for entry in (repo.get("root") or [])]
    comments = repo.get("comments", [])
    open_issues = [item for item in repo["openIssues"] if "pull_request" not in item]

    status_issues = {}
    for item in open_issues:
        match = re.fullmatch(r"Status:\s*(\S+)", (item.get("title") or "").strip())
        labels = {label["name"] for label in item.get("labels", [])}
        if match and "status-board" in labels and match.group(1) in names:
            status_issues[match.group(1)] = item

    heartbeats = {}
    for name, item in status_issues.items():
        own = [comment for comment in comments if number_of(comment) == item["number"]]
        heartbeats[name] = build.heartbeats_from(own, name)

    open_prs = []
    for pr in repo["openPrs"]:
        pr = dict(pr)
        pr["_reviews"] = repo.get("reviews", {}).get(str(pr["number"]), [])
        pr["_comments"] = [comment for comment in comments if number_of(comment) == pr["number"]]
        open_prs.append(pr)

    data = {
        "paused": "PAUSE" in root,
        "pause_files": [name for name in root if name == "PAUSE" or name.startswith("PAUSE-")],
        "open_issues": open_issues,
        "closed_issues": [],
        "status_issues": status_issues,
        "heartbeats": heartbeats,
        "open_prs": open_prs,
        "merged_prs": [],
        "pr_files": {},
        "main_commits": [],
        "notes": [],
    }
    model = build.build_model(schedule, data, now)
    print(json.dumps({
        "states": {row["name"]: row["state"] for row in model["agents"]},
        "waiting": {founder: [item["number"] for item in items] for founder, items in model["waiting"].items()},
    }))


if __name__ == "__main__":
    main()
