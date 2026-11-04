# Worker console demo: progress

FAKE: everything in this folder uses made-up claims. No real patient data.

Last updated: 5 Nov 2026 (Sydney), by a Claude session working for Adam.
Branch: claude/worker-console-demo (stacked on claude/mission-control-dashboard, pull request #11).

## Steps (from the worker console demo request of 5 Nov 2026)

| Step | What | State |
|---|---|---|
| 0 | Look first: what demo code exists | Done (table below) |
| 1 | rules/appeal_rules.json from official pages | Done |
| 2 | Data script and planted errors | Done |
| 3 | Today screen | Not done |
| 4 | Claim workspace with guided steps and coach panel | Not done |
| 5 | Letter editor | Not done |
| 6 | Checker plus score_demo.mjs (15 of 15) | Checker logic and score done; checker screen not done |
| 7 | Review screen | Not done |
| 8 | Submit and track | Not done |
| 9 | My progress and audit log | Not done |
| 10 | Presenter panel and tour | Not done |
| 11 | Browser tests, screenshots, fixes | Not done |
| 12 | Pull request and hand-off | Not done |

## Step 0: what demo code existed (checked 5 Nov 2026, every branch)

| Path | What it is | Works? | What is missing | Reused? |
|---|---|---|---|---|
| site/demo/README.md (#11) | Rules for the demo folder: FAKE data, no paid calls, no outside scripts | Text only | No demo page at all | Yes: its rules are followed here |
| prototype/README.md (#1 to #13) | Folder rules for the demo code | Text only | No code, no SPEC.md, no prompts or results | No |
| data/fake-claims/README.md | Rules for made-up claims (mark FAKE, answer key never seen by the checker) | Text only | No claims.json or answer-key.json | Yes: its FAKE marking and answer key rule |
| brand/design-tokens.css (#12 only, not merged) | Design system tokens, version 1 | Yes | Not on main | Yes: copied into tokens.css |
| site/assets/*.woff2 and licences (#12 only) | Cut-down fonts Site Sans and Site Serif | Yes | Not on main | Yes: copied into assets/ |
| hq/ (#13) | Founders' dashboard | Tested there | Not a demo | Pattern only (plain HTML, CSS and JavaScript; Playwright screenshots) |
| Practice-side demo | Not found on any branch | No | Everything | The presenter panel says it is not in the repository yet |
| Logo B and the company name | Kept out of the public repository on purpose until the domain is bought (BRAND_BRIEF.md) | n/a | n/a | js/brand.js holds a placeholder; one file to change later |

## Last score output

```
Planted errors caught: 15 of 15 (target 15 of 15)
False alarms on clean claims: 0 (target 0; 35 clean claims, 0 failed checks)
Claims with a complete deadline calculation: 50 of 50 (target 50 of 50)
Other failed checks on planted claims: 0
```

## Half finished

- Nothing yet beyond the steps marked done.

## Known bugs

- None found yet.

## Next three actions

1. Build the app shell (index.html, app.css, js/main.js, js/state.js) and the Today screen.
2. Build the claim workspace (three columns, steps a to g, coach panel).
3. Build the letter editor inside step e.
