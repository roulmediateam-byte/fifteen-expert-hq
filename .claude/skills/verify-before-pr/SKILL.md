---
name: verify-before-pr
description: "Checks to run before opening or updating a pull request in this repository: the tests of each folder changed, the change check script (long dashes, hidden characters, secrets, possible patient data, phone numbers and emails, in lines, new file names and commit messages), folders and names, a read of your own diff, and a short report for the Evidence section. Use at the end of every agent run that changes files. The reviewer also uses main's copy of the change check on each pull request."
---

Adapted from ECC (skills/verification-loop), MIT licence: .claude/ecc-license.txt. check-changes.mjs is ours; it uses HQ's form checks (hq/lib/validate.js).

# Verify before a pull request

Run these steps after your last change and before you push. If a step fails, fix it and run the steps again. Never open a pull request with a known failure, unless it is a draft and Needs a human says why.

## 1. Tests

Run the tests of every folder you changed, from the top of the repository:

- hq/: `cd hq && npm test`
- company/: `cd company && npm test`
- ops/dashboard/: `python3 ops/dashboard/selftest.py`
- .claude/skills/verify-before-pr/: `node --test .claude/skills/verify-before-pr/check-changes.test.mjs`
- prototype/ and site/demo/: the commands in their README.md

Write down the counts: passed, failed, skipped. "No tests for these files" is a fine answer for Markdown.

## 2. The change check

```bash
git fetch origin main
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then git fetch --unshallow origin; fi
node .claude/skills/verify-before-pr/check-changes.mjs
```

- It compares your branch with origin/main and reads what you add: the added lines (including changes not yet committed and new files), the names of new files, and your commit messages. It also reads every commit on your branch, merges included, for secrets and patient data that were added and removed later, because a pushed commit stays public. It changes nothing and sends nothing anywhere.
- STOP (exit code 1): a long dash, a hidden character, something that looks like a password, key or token, or a file it cannot read as text. It reads every file as text except real PNG, JPEG, GIF, WebP and ICO images and WOFF fonts, which it knows by their first bytes. Fix every stop.
- A stop marked "commit" is in an earlier commit or a commit message. Before you push, rewrite the branch so no commit holds it: `git reset --soft "$(git merge-base origin/main HEAD)"`, then commit again. That keeps your changes and replaces only your own commits, never work already on main. If a real secret was already pushed, tell human:adam under Needs a human so he can change it.
- WARN (exit code 0): something that looks like patient data, a phone number or an email, or a table with patient data columns. Look at each line. If it is made-up data marked FAKE, or a founder's own detail, say so in Evidence, line by line. Otherwise remove it. The reviewer reads each line itself.
- Exit code 2: the check could not run, and nothing was checked (for example origin/main is missing, or git failed). Fix that and run it again. Never push without a result.
- It never prints the text it found, only the place and the kind. Keep it that way in your own notes: never copy a secret or patient data into a comment.
- If you ever see real patient data, stop at once and follow CLAUDE.md, "Also".

## 3. Folders and names

- `git diff --name-only origin/main...HEAD`: every file is in a folder your brief allows (agents/schedule.json).
- New file names follow README.md: lower case with hyphens; dated files start YYYY-MM-DD.
- You did not add, change or delete PAUSE, any `PAUSE-<name>` file, or anything in .claude/.

## 4. Read your own diff

`git diff origin/main...HEAD`: no stray files, no debug output, no leftover notes to yourself, nothing outside your Issue.

## 5. The report

Put this block in the Evidence section of the pull request:

```
Verify before PR
Tests: <folder>: <n> passed, <n> failed (or: no tests for these files)
Change check: pass (or: <n> warnings, each explained below)
Folders and names: pass
Diff read: yes
```

## For the reviewer

The reviewer runs main's copy of the check, never the pull request's own copy, so a pull request cannot weaken the check that reads it. It reads the change as data and runs none of the pull request's code, so it may do this for any pull request:

```bash
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then git fetch --unshallow origin; fi
git fetch origin main "+pull/<N>/head:pr-<N>"
[ -d /tmp/check-main ] || git worktree add --detach /tmp/check-main origin/main
git worktree add --detach /tmp/pr-<N> pr-<N>
node /tmp/check-main/.claude/skills/verify-before-pr/check-changes.mjs --repo /tmp/pr-<N> --base origin/main
git worktree remove --force /tmp/pr-<N>
```

- In a sweep, /tmp/check-main serves every pull request. At the end of the run: `git worktree remove --force /tmp/check-main`.
- If main has no copy of the check yet, mark the line "not checked". Exit code 2 also means "not checked": say why.
