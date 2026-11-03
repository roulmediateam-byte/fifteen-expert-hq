# GitHub labels

Agent labels say which agent does the work. Human labels say which human must act: decide, approve or answer. An Issue can carry both kinds. Agents work only on Issues with their own agent label (CLAUDE.md, rule 8).

Status: all 11 created on GitHub on 2026-11-04 by Claude through the GitHub API. The labels already on the repository (bug, documentation and the rest) were left as they are. status-board and mission-control mark the Status Issues (#4 to #9) and the Mission control Issue (#10); they are not work labels.

| Label | Colour | Meaning | Owner |
|---|---|---|---|
| agent:chief-of-staff | 1D76DB (blue) | Chief of staff agent: daily digest, chasing stuck Issues | Adam |
| agent:design | 1D76DB (blue) | Design agent: website, deck, flyer, brand assets | Adam |
| agent:engineer | 1D76DB (blue) | Engineer agent: prototype code and tests | Marvin |
| agent:reviewer | 1D76DB (blue) | Reviewer agent: code and security review of every pull request | Marvin |
| agent:research | 1D76DB (blue) | Research agent: appeal rules, payer policy, competitors | Adam |
| agent:sales | 1D76DB (blue) | Sales agent: target lists, outreach drafts | Melvin (off until phase 5) |
| human:adam | D93F0B (orange) | Needs Adam: money, contracts, sales, design approval | Adam |
| human:melvin | D93F0B (orange) | Needs Melvin: claims, appeal rules, HIPAA privacy | Melvin |
| human:marvin | D93F0B (orange) | Needs Marvin: tech, agents, security | Marvin |
| status-board | 5319E7 (purple) | Status Issues for agent heartbeats; not work | Marvin |
| mission-control | 0E8A16 (green) | The pinned Mission control dashboard Issue | Marvin |

## Recreate or repair them

Run with the GitHub CLI signed in. --force updates a label that already exists.

```
R=roulmediateam-byte/fifteen-expert-hq
gh label create "agent:chief-of-staff" -R $R --color 1D76DB --description "Chief of staff agent: daily digest, chasing stuck Issues" --force
gh label create "agent:design" -R $R --color 1D76DB --description "Design agent: website, deck, flyer, brand assets" --force
gh label create "agent:engineer" -R $R --color 1D76DB --description "Engineer agent: prototype code and tests" --force
gh label create "agent:reviewer" -R $R --color 1D76DB --description "Reviewer agent: code and security review of every pull request" --force
gh label create "agent:research" -R $R --color 1D76DB --description "Research agent: appeal rules, payer policy, competitors" --force
gh label create "agent:sales" -R $R --color 1D76DB --description "Sales agent: target lists, outreach drafts" --force
gh label create "human:adam" -R $R --color D93F0B --description "Needs Adam: money, contracts, sales, design approval" --force
gh label create "human:melvin" -R $R --color D93F0B --description "Needs Melvin: claims, appeal rules, HIPAA privacy" --force
gh label create "human:marvin" -R $R --color D93F0B --description "Needs Marvin: tech, agents, security" --force
gh label create "status-board" -R $R --color 5319E7 --description "Status Issues for agent heartbeats; not work" --force
gh label create "mission-control" -R $R --color 0E8A16 --description "The pinned Mission control dashboard Issue" --force
```

A new agent gets a new agent: label, a row here, and a file in agents/.
