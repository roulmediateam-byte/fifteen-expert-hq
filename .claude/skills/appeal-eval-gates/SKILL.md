---
name: appeal-eval-gates
description: "Pass or fail gates for the appeal prototype on made-up claims: what must be right every time (deadlines, patient data, caught errors, no false all-clear), what needs 95% or more, why AI steps run three times in a row (pass^3), and how to report. Use when building or changing the drafting or checking steps in prototype/, and for Melvin's week 3 test on 50 made-up claims."
---

Adapted from ECC (skills/healthcare-eval-harness and skills/eval-harness), MIT licence: .claude/ecc-license.txt. The gates and numbers below are a proposal: Melvin and Adam confirm them before the week 3 test.

# Appeal eval gates

An appeal goes to an insurer before a deadline. One wrong deadline can lose a claim for good. So some checks must be right every time, and the AI steps must be right several runs in a row, because AI output varies from run to run.

## The test set

- data/fake-claims/claims.json: 50 made-up claims with planted errors, and data/fake-claims/answer-key.json (data/fake-claims/README.md).
- The drafting and checking steps never see the answer key. Only the scoring step reads it.
- Every saved result starts with FAKE (agents/engineer.md).

## Critical gates: 100%, or the build is not ready

1. Deadlines: every appeal deadline matches the written deadline rule for its payer and appeal level, and names that rule's source, for all 50 claims. prototype/SPEC.md will say where the rules live; today prototype/ holds only its README.md.
2. Patient data: no output, log, file name, web address or screenshot holds anything but FAKE data, and nothing is sent outside.
3. Caught errors: every planted error that makes an appeal unsafe to send is caught (a wrong code, a missing record, an unsupported clinical statement, a missed deadline).
4. No false all-clear: the checker never marks a claim ready to send while the answer key lists an open error for it.

## High gates: 95% or more, and a human looks at every miss

5. False alarms: the checker flags at most 5% of clean claims (target: none).
6. Letter rules: length, tone and required parts (our own rules, labelled ours).
7. Denial reasons: each CARC and RARC code is explained with the official X12 text.

## Run three times

- pass@1 means the first run passes. pass^3 means three runs in a row all pass.
- Critical gates need pass^3: the drafting and checking steps run three times on all 50 claims, and every run must pass every critical gate. That full set is Melvin's week 3 test, which a founder starts.
- In a scheduled run (30 minutes, and no paid API calls until phase 7 of the playbook: prototype/README.md), run three times on a small FAKE subset, about 10 claims (our estimate of what fits), and only the steps that need no paid call. Mark the rest "not run: needs a founder".
- Steps with no AI in them (date maths, parsing, scoring) give the same answer every run, so one run is enough.

## Report, in the pull request's Evidence

```
Appeal eval: <date>, commit <short id>, 3 runs on <n> FAKE claims
| Gate | Run 1 | Run 2 | Run 3 | Result |
|---|---|---|---|---|
| 1 Deadlines | 50/50 | 50/50 | 50/50 | pass |
| ... | | | | |
Verdict: ready, or not ready (which gate, which claims)
```

## Rules

- Never lower a critical gate below 100%, and never skip a run because "it passed last time".
- Never tune a step on the answer key. Fix the rule or the prompt, then run the full set again.
- Every new kind of error Melvin finds becomes a new planted error and a new line in the answer key.
