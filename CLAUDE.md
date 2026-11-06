# Rules for every agent

This repository is the filing cabinet of The $15-an-Hour Expert. We appeal denied medical insurance claims for small US medical practices. Every agent follows these rules on every task. An agent's own brief in agents/ can add limits but never remove one of these rules.

## Rules

1. Never push to main; always work on a claude/ branch and open a pull request.
2. Read PROJECT_STATE.md first. Then read your brief in agents/, your Issue, and the README.md of each folder you will change.
3. If a file named PAUSE, or `PAUSE-<your agent name>` (for example PAUSE-design), exists at the top level of main, post one heartbeat with state=paused on your Status Issue (agents/README.md, section "Heartbeat"), then stop at once and wait for a human. PAUSE stops every agent; PAUSE-<name> stops one. Check for both before you start and between steps (agents/README.md has the command). Only a human creates or removes them, by hand or with HQ's stop switch.
4. No patient data, ever. Use made-up data only, and mark it FAKE (see data/fake-claims/README.md).
5. Never write a private person's name, phone or email in an Issue, comment, pull request or file. Write their role and practice type instead. This means people outside the company, such as a practice's office manager; the founders' names are fine.
6. Never send messages, emails or posts outside the company. Write drafts in this repository or on your Issue. A human sends.
7. Never merge your own pull request.
8. Work only on the standing jobs in your brief and on Issues with your agent label: agent:chief-of-staff, agent:design, agent:engineer, agent:reviewer, agent:research or agent:sales (see ops/setup-labels.md). Leave every other Issue alone. One exception: the chief of staff also files every Issue titled "File: ..." (see agents/chief-of-staff.md).
9. Every pull request has a title in the form "[agent] what", for example "[design] Draft the practice flyer", and a body with three sections: Done, Evidence, Needs a human. Use the template below.
10. Label estimates "our estimate".
11. Never use the long dash character. Use a comma, a colon or a full stop instead.

## Also

- If you see patient data anywhere (a patient name, date of birth, member ID, medical record or real claim file): stop, do not copy it, and open an Issue labelled human:adam and human:melvin that says where it is, without the data.
- Label legal points "general information, not legal advice".
- Never commit passwords, API keys, tokens or bank details.
- Never write the company name, logo or domain in this repository until the founders say the domain is bought. Pages read the name from the Cloudflare setting COMPANY_NAME.
- .claude/ holds reviewed checklists and skills, adapted from ECC (.claude/README.md). Read and use them when your brief says so. Never change anything in .claude/: only a founder's pull request may, and Adam approves it.

## Pull request template

Title: [agent] what

```markdown
## Done
What you did, in one to three lines, and the Issue (for example: Closes #12).

## Evidence
Test results, links, screenshots or file paths, then the start and finish time in Sydney, the minutes used of 30, and this run's session link (for example: Started 01:04, finished 01:26 Sydney, 22 of 30 minutes).

## Needs a human
The exact decision or action, and who: human:adam or human:melvin. Write "Nothing" if nothing.
```
