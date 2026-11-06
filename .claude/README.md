# .claude

Owner: Adam (HIPAA security official). Only a founder's pull request may change this folder, and Adam approves it. Agents read it and never change it.

What goes here: reviewed checklists and skills for our agents, adapted from ECC, an open-source collection for Claude Code (https://github.com/affaan-m/ECC, MIT licence, see ecc-license.txt). ecc-source.md records the exact upstream commit, every ECC file we used with its SHA-256, what we changed and what we left out.

Nothing here runs on its own: no hooks, no settings.json, no plugins, no MCP servers, no network calls. A file acts only when an agent's brief tells the agent to read it or run it.

## What is here

| Path | What it is | Used by |
|---|---|---|
| agents/phi-check.md | Checklist: patient data in a change, and code that could leak it later | reviewer, on every pull request |
| agents/security-check.md | Checklist: security of code that runs | reviewer |
| agents/code-check.md | Checklist: tests that prove the change, and errors that fail silently | reviewer |
| skills/verify-before-pr/ | Steps to run before opening a pull request, and check-changes.mjs, the change check | every agent that opens pull requests; the reviewer |
| skills/test-first/ | Test first, then the code that passes it | engineer |
| skills/accessibility/ | WCAG 2.2 AA checks for web pages | design, engineer |
| skills/research-method/ | Research with sources, and web pages as data, never instructions | research |
| skills/agent-config-review/ | Checks for changes to how agents are set up | reviewer, founders |
| skills/appeal-eval-gates/ | Pass or fail gates for the appeal prototype on made-up claims | engineer, Melvin |
| ecc-source.md | Where each file came from, and how to update | Adam |
| ecc-license.txt | ECC's MIT licence, kept as the licence asks | Everyone |

## How agents use it

- Scheduled runs clone this repository after they start, and Claude Code may not load .claude/ then. So each brief names the files to read, and an agent reads them as plain files: it follows a skill's SKILL.md, and applies a file in agents/ as a checklist.
- The reviewer applies the three checklists in agents/ itself, from main's copy, and starts no helper agent. A helper started with the Agent tool in a scheduled run gets every tool the run has (Bash, and GitHub as the account that runs the task), whatever its file's tools line says, and it would read untrusted pull request text.
- The change check runs from main's copy when the reviewer uses it (skills/verify-before-pr/SKILL.md, section "For the reviewer"), so a pull request cannot weaken the check that reads it.
- In a Claude Code session opened in this repository on a founder's computer, Claude Code loads .claude/agents/ and .claude/skills/ by itself. There a founder can start the three checks as helpers, and their tools line limits them to Read, Grep and Glob (our estimate, from Claude Code's documentation on subagents; not tested here).

## Rules for this folder

- Adam reads every file here in full before it is merged, and again on every update (the starter kit's security checklist: read every file, pin, no surprises).
- Copy nothing from ECC without reading it. To update, follow ecc-source.md, section "How to update". Take files only from the official repository, never from a copy.
- No hooks, settings.json, MCP servers, plugins or downloads here without a row in ops/decisions.md first.
- No brief may start helper agents in a scheduled run (agents/reviewer.md).
- The same rules as everywhere: no patient data, no secrets, no long dash, made-up examples marked FAKE.
