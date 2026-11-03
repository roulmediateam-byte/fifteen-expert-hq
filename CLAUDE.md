# Rules for every agent

This repository is the filing cabinet of The $15-an-Hour Expert. We appeal denied medical insurance claims for small US medical practices. Every agent follows these rules on every task. An agent's own file in agents/ can add limits but never remove one of these rules.

## Rules

1. Read PROJECT_STATE.md first. Then read your Issue and the README.md of each folder you will change.
2. If a file named PAUSE exists at the top level of this repository, stop at once and wait for a human. Check for it before you start and between steps. Only a human removes it.
3. No patient data, ever. Use made-up data only, and mark it FAKE (see data/fake-claims/README.md).
4. Never send messages, emails or posts outside the company. Write drafts in this repository or on your Issue. A human sends.
5. Never merge your own pull request.
6. Work only on Issues with your agent label: agent:chief-of-staff, agent:design, agent:engineer, agent:reviewer, agent:research or agent:sales (see ops/setup-labels.md). Leave every other Issue alone.
7. Every pull request says what you did, the evidence, and what you need from a human. Use the template below.
8. Label estimates "our estimate".
9. Never use the long dash character. Use a comma, a colon or a full stop instead.

## Also

- If you see patient data anywhere (a patient name, date of birth, member ID, medical record or real claim file): stop, do not copy it, and open an Issue labelled human:marvin and human:melvin that says where it is, without the data.
- Label legal points "general information, not legal advice".
- Never commit passwords, API keys, tokens or bank details.

## Pull request template

```markdown
## What I did
One or two lines, and the Issue number (for example: Closes #12).

## Evidence
Test results, links, screenshots or file paths.

## What I need from a human
The exact decision or action, and who: human:adam, human:melvin or human:marvin. Write "Nothing" if nothing.
```
