# Worker console demo: progress

FAKE: everything in this folder uses made-up claims. No real patient data.

Last updated: 5 Nov 2026, 03:10 Sydney, by a Claude session working for Adam.
Branch: claude/worker-console-demo (stacked on claude/mission-control-dashboard, pull request #11).
How to run and test: [README.md](README.md).

## Steps (from the worker console demo request of 5 Nov 2026)

| Step | What | State |
|---|---|---|
| 0 | Look first: what demo code exists | Done (table below) |
| 1 | rules/appeal_rules.json from official pages | Done |
| 2 | Data script and planted errors | Done |
| 3 | Today screen | Done |
| 4 | Claim workspace with guided steps and coach panel | Done |
| 5 | Letter editor | Done |
| 6 | Checker screen plus score_demo.mjs (15 of 15) | Done |
| 7 | Review screen | Done |
| 8 | Submit and track | Done |
| 9 | My progress and audit log | Done |
| 10 | Presenter panel and tour | Done |
| 11 | Browser tests, screenshots, fixes | Done |
| 12 | Pull request and hand-off | Waiting: the session may not push yet (see Half finished) |

## Step 0: what demo code existed (checked 5 Nov 2026, every branch)

| Path | What it is | Works? | What is missing | Reused? |
|---|---|---|---|---|
| site/demo/README.md (#11) | Rules for the demo folder: FAKE data, no paid calls, no outside scripts | Text only | No demo page at all | Yes: its rules are followed here |
| prototype/README.md (#1 to #13) | Folder rules for the demo code | Text only | No code, no SPEC.md, no prompts or results | No |
| data/fake-claims/README.md | Rules for made-up claims (mark FAKE, answer key never seen by the checker) | Text only | No claims.json or answer-key.json | Yes: its FAKE marking and answer key rule |
| brand/design-tokens.css (#12 only, not merged) | The design system's tokens (tokens.json version 1, the tokens of design system version 6) | Yes | Not on main | Yes: copied into tokens.css |
| site/assets/*.woff2 and licences (#12 only) | Cut-down fonts Site Sans and Site Serif | Yes | Not on main | Yes: copied into assets/ |
| hq/ (#13) | Founders' dashboard | Tested there | Not a demo | Pattern only (plain HTML, CSS and JavaScript; Playwright screenshots) |
| Practice-side demo | Not found on any branch | No | Everything | The presenter panel says it is not in the repository yet |
| Logo B and the company name | Kept out of the public repository on purpose until the domain is bought (BRAND_BRIEF.md) | n/a | n/a | js/brand.js holds a placeholder; one file to change later |

## Last results (5 Nov 2026, 03:05 Sydney)

Score (`node site/demo/worker/scripts/score_demo.mjs`):

```
Planted errors caught: 15 of 15 (target 15 of 15)
False alarms on clean claims: 0 (target 0; 35 clean claims, 0 failed checks)
Claims with a complete deadline calculation: 50 of 50 (target 50 of 50)
Other failed checks on planted claims: 0
```

Logic tests (`node --test site/demo/worker/tests/logic.test.mjs`): 12 of 12 pass.

Browser tests (`node site/demo/worker/tests/browser.test.mjs`), Chromium, 14 screens at each of 390, 320 and 1280 px:

- Console errors: 0. Sideways scroll: none. Content spilling out of the main column: none.
- Text contrast under 4.5 to 1: 0 (a self test first proves the check catches a planted pale line).
- Focus ring: visible on every control reached with Tab (first 40 stops per screen; the self test proves it catches a control with no ring).
- Keyboard only: every screen reached (claim workspace, letter editor, checker, submit and track, my progress, audit log, Today, review, presenter panel).

Walkthrough (`node site/demo/worker/tests/walkthrough.mjs`), tour claim 1 (C-1012) from Today to Approved:

- 1280 px: 17 clicks. Scripted run 1.9 seconds. Presenter pace 3:33, our estimate. Careful worker pace 6:47, our estimate.
- 390 px: 19 clicks (two extra taps back to the Steps tab). Presenter pace 3:39, our estimate. Careful worker pace 6:53, our estimate.
- Target (under 5 minutes, presenter pace): met at both widths.
- Presenter pace: the talk track of tour steps 1 to 8 at 150 words a minute, 3 seconds per click, 5 seconds per screen. Careful worker pace: a reading allowance per screen and the whole letter read by Jordan and again by Melvin. Both are our estimate.

## Fixed in step 11 (found by the tests and the screenshots)

- The letter view dropped the start of any sentence with an amount in it ("Amount in dispute: $150.00" showed as "00"), in the editor and on Melvin's review screen. The letter text itself was right. Fixed in js/lib/letter.js, with a test over all 50 letters.
- The representation check did not check that the CMS-1696 is still valid (one year from both signatures, CMS). It does now, with a test.
- In presenter mode the Today table ran under the presenter panel. The queue now turns into cards whenever its own box is narrow.
- At 320 px the review screen scrolled sideways; document tables broke codes mid-word; the Documents tab label broke in two.
- Step f had no clear next button after all 10 checks passed. It now shows "All 10 passed. Go to step g".
- The coach examples for steps c and e showed one claim's dates on every claim. They are now clearly general examples.
- Smaller: the visit note summary read "Visit for the visit for"; the CARC 16 and 252 usage notes are marked shortened; the "start": null fields are gone from the rules file.

## Half finished

- Step 12: the branch is committed locally but not pushed. The session's safety check refused push access, so Adam must approve it. After that: push, open the pull request "Worker console demo (made-up claims)" for Melvin, and file Issues for anything unfinished.
- agents/engineer.md: the paragraph for the nightly engineer run is added on this branch (end of the file). The engineer's scheduled task itself is created in Prompt 5.

## Known limits

- The "View as" menu cuts off the long role names on narrow phones; the full name shows when the menu opens.
- The checker cannot judge how strong an argument is. Melvin does (tour claim 3 shows this).
- The practice-side demo does not exist yet.
- Logo B and the company name are not shown (placeholder), until the domain is bought.

## Next three actions

1. Adam approves push access; the session pushes this branch and opens the pull request for Melvin.
2. Melvin reviews the coach panel advice, the ten checks and what he would send back (checklist in the pull request).
3. After Melvin's notes: fix what he sends back, then rerun score_demo.mjs and the browser tests.
