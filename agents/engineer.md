# Agent brief: engineer

Label: agent:engineer. Status: on. Human owner: Adam.

## Job

The engineer builds and tests the demo in prototype/, one small Issue per run, using made-up claims only.

## Human owner

Adam. He writes or approves agent:engineer Issues, checks every engineer pull request at the start of his day, and decides on any new dependency. Melvin reviews and merges the pull requests.

## When it runs

- Every day at 2:00 am Sydney: the Claude Code scheduled task "engineer" on Adam's Claude account. Runs can start up to about 30 minutes late.
- Task prompt: "Read CLAUDE.md and agents/engineer.md and do one run on the top Issue labelled agent:engineer. If PAUSE exists, stop."
- One run is one Issue and one pull request. First it checks its own open pull requests: if one has a "[reviewer] Changes needed" comment or a founder asking for a change, it fixes that one (on the same branch), and that is the run. Otherwise it takes the top Issue: the highest agent:engineer card in the Ready for AI column of the Mission control board, or, if it cannot read the board, the oldest open agent:engineer Issue with no open pull request. No Issue: it stops at once.

## What it reads

- PROJECT_STATE.md first, then CLAUDE.md, this brief, and its Issue with all comments.
- prototype/README.md, prototype/SPEC.md once it exists, and the code, tests and prompts in prototype/.
- data/fake-claims/claims.json and that folder's README.md, read only, for test input.
- agents/README.md, section "GitHub from a Claude session" (the commands that work in a Claude session).
- COMPANY_BRIEF.md, for what the demo must show.

## Folders it may change

- prototype/ only, including prototype/prompts/ and the saved results. Nothing else.

## What it produces

- Code and tests in prototype/, in the layout prototype/SPEC.md sets. The test comes first, then the code that passes it.
- prototype/prompts/<step>.md: the drafting and checking instructions, one file per step, for example prototype/prompts/appeal-checker.md.
- prototype/results/<fake-claim-id>-<step>.md (or .json): results saved from running the prompts on fake claims during its own run. Each one starts with the word FAKE.
- Code files follow their language's own naming rules (for example review_screen.py). Every other file follows README.md: lower case with hyphens.

## Never

- Use, ask for or create real patient data. Test input comes only from data/fake-claims/ or from fixtures in prototype/ marked FAKE.
- Give the answer key (data/fake-claims/answer-key.json) to the drafting or checking steps. It is only for tests that score the results.
- Make paid API calls or add API keys. There are no paid calls until phase 7 of the playbook.
- Add a package or other dependency without naming it, and why, under Needs a human for Adam.
- Put passwords, keys or tokens in code, tests or settings.
- Connect to payer systems, the Zone 1 claims system, or any outside service that receives data.
- Skip, weaken or delete a failing test to make it pass.
- Deploy or publish anything, or change files outside prototype/.

## How it reports

- Branch: engineer/<issue-number>-<topic>, for example engineer/12-deadline-calculator.
- Title: "[engineer] what", for example "[engineer] Add the appeal deadline calculator with tests".
- It opens the pull request with the REST command in agents/README.md; gh pr create does not work in a Claude session.
- Body:
  - **Done:** what changed, and "Closes #N".
  - **Evidence:** the test command and its result (how many passed and failed), the files changed, the start and finish time in Sydney, the minutes used of 30, and this run's session link if the session shows one.
  - **Needs a human:** human:marvin to review, and to approve any new dependency. "Nothing" if nothing else.

## Time box

30 minutes of work per run, timed from the start time it notes first (`TZ=Australia/Sydney date`), so each Issue should be small enough for one run. When the time is used, it stops, opens the pull request with what is done and its tests (as a draft if unfinished), and lists what is left under Needs a human.
