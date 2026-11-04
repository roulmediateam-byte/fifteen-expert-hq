# GitHub labels

Agent labels say which agent does the work. Human labels say which human must act: decide, approve or answer. An Issue can carry both kinds. Agents work only on Issues with their own agent label (CLAUDE.md, rule 8).

Status: the first 11 were created on GitHub on 2026-11-04 by Claude through the GitHub API. priority:high and priority:normal (added for HQ's Give work button, 2026-11-04) are not created yet: run their two commands below, or GitHub makes them grey the first time HQ uses them. The labels already on the repository (bug, documentation and the rest) were left as they are. status-board and mission-control mark the Status Issues (#4 to #9) and the Mission control Issue (#10); they are not work labels.

| Label | Colour | Meaning | Owner |
|---|---|---|---|
| agent:chief-of-staff | 1D76DB (blue) | Chief of staff agent: daily digest, chasing stuck Issues | Adam |
| agent:design | 1D76DB (blue) | Design agent: website, deck, flyer, brand assets | Adam |
| agent:engineer | 1D76DB (blue) | Engineer agent: prototype code and tests | Adam |
| agent:reviewer | 1D76DB (blue) | Reviewer agent: code and security review of every pull request | Adam |
| agent:research | 1D76DB (blue) | Research agent: appeal rules, payer policy, competitors | Adam |
| agent:sales | 1D76DB (blue) | Sales agent: target lists, outreach drafts | Melvin (off until phase 5) |
| human:adam | D93F0B (orange) | Needs Adam: money, contracts, sales, design approval, tech, agents, security | Adam |
| human:melvin | D93F0B (orange) | Needs Melvin: claims, appeal rules, HIPAA privacy, reviewing and merging pull requests | Melvin |
| status-board | 5319E7 (purple) | Status Issues for agent heartbeats; not work | Adam |
| mission-control | 0E8A16 (green) | The pinned Mission control dashboard Issue | Adam |
| priority:high | B60205 (red) | Do this first: agents take priority:high Issues before any other (agents/README.md, section "Picking work") | Adam |
| priority:normal | C5DEF5 (light blue) | Normal order: oldest first | Adam |

human:marvin was created on 4 Nov 2026 and is no longer used, because Marvin left the founders that day. Delete it on github.com (Issues, Labels), or leave it unused.

## Recreate or repair them

Run with the GitHub CLI signed in. --force updates a label that already exists. gh label create uses GraphQL, which fails inside a Claude session; there, use the REST form instead, for example: `gh api repos/$R/labels -X POST -f name=priority:high -f color=B60205 -f description="Do this first: agents take these before any other"`. Or on github.com: Issues, Labels, New label.

```
R=roulmediateam-byte/fifteen-expert-hq
gh label create "agent:chief-of-staff" -R $R --color 1D76DB --description "Chief of staff agent: daily digest, chasing stuck Issues" --force
gh label create "agent:design" -R $R --color 1D76DB --description "Design agent: website, deck, flyer, brand assets" --force
gh label create "agent:engineer" -R $R --color 1D76DB --description "Engineer agent: prototype code and tests" --force
gh label create "agent:reviewer" -R $R --color 1D76DB --description "Reviewer agent: code and security review of every pull request" --force
gh label create "agent:research" -R $R --color 1D76DB --description "Research agent: appeal rules, payer policy, competitors" --force
gh label create "agent:sales" -R $R --color 1D76DB --description "Sales agent: target lists, outreach drafts" --force
gh label create "human:adam" -R $R --color D93F0B --description "Needs Adam: money, contracts, sales, design approval, tech, agents, security" --force
gh label create "human:melvin" -R $R --color D93F0B --description "Needs Melvin: claims, appeal rules, HIPAA privacy, reviewing and merging pull requests" --force
gh label create "status-board" -R $R --color 5319E7 --description "Status Issues for agent heartbeats; not work" --force
gh label create "mission-control" -R $R --color 0E8A16 --description "The pinned Mission control dashboard Issue" --force
gh label create "priority:high" -R $R --color B60205 --description "Do this first: agents take these before any other" --force
gh label create "priority:normal" -R $R --color C5DEF5 --description "Normal order: oldest first" --force
```

A new agent gets a new agent: label, a row here, and a file in agents/.
