# Worker console demo: progress

FAKE: everything in this folder uses made-up claims. No real patient data.

Last updated: 5 Nov 2026, 12:55 Sydney, by a Claude session working for Adam.
Branch: claude/worker-console-demo. It started on pull request #11's branch; on 5 Nov 2026 it was moved onto main, which now holds #11.
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
| 12 | Pull request and hand-off | Done: pull request #21, and a heartbeat on Status Issue #6 |

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

## Last results (5 Nov 2026, 12:05 Sydney, after the move onto main)

Score (`node site/demo/worker/scripts/score_demo.mjs`):

```
Planted errors caught: 15 of 15 (target 15 of 15)
False alarms on clean claims: 0 (target 0; 35 clean claims, 0 failed checks)
Claims with a complete deadline calculation: 50 of 50 (target 50 of 50)
Other failed checks on planted claims: 0
```

Logic tests (`node --test site/demo/worker/tests/logic.test.mjs`): 14 of 14 pass.

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

## Rules fact check (5 Nov 2026)

A separate agent reopened every CMS and X12 page cited in rules/appeal_rules.json and confirmed 90 items (level numbers, quotes, rule texts, code texts, CARC 15's stop date) with no mismatch. It found four things to add, all done:

- The CMS-1696 page also says the representation is valid, unless revoked, for the duration of the claim or appeal it was filed with. The representation check now accepts a form older than a year on a later level of the same appeal.
- The good cause text no longer says a late appeal is accepted "only" with good cause; CMS says it evaluates each request.
- The 2027 amounts in controversy are noted: $200 for the ALJ hearing (unchanged) and $2,000 for court (up from $1,960). The demo date stays in 2026.
- CARC 96 is marked shortened and RARC MA04 has its full text.

## Hosted copies (5 Nov 2026)

- A private Claude artifact: one self-contained page (code, data and fonts inside it, so the host loads nothing else) that opens on the guided tour. Its link is in the private project notes, not in this public repository. Rebuild and republish it after any change to the demo.
- The public link (live since 5 Nov 2026, 12:52 Sydney): a Cloudflare Pages project, created in Adam's Cloudflare account with the settings in README.md, serves branch claude/worker-demo-pages. Its first build ran the build step ("Hosted settings: company name ...; opens as presenter."), and the live page was checked: the name shows, it opens on the guided tour, and tour claim 1 opens. Preview branches are off. Its address shows the company name, so it is in the private project notes, not here. At build time scripts/hosted_settings.mjs fills the name and the starting view from the project's settings (with a logic test), and _headers asks search engines not to index the copy. Checked locally the way Cloudflare builds and serves it (the build step with both settings, then the files at the top of an address), at 1280 and 390 px. README.md, section "Hosted copy", has the settings and the refresh command. The live copy changes only when someone refreshes that branch; the nightly engineer works on claude/worker-console-demo and does not touch it.
- The last tour step links to the client portal demo's public copy (5 Nov 2026): the host's setting DEMO_PORTAL_URL, with this branch's pages refreshed from claude/client-portal-demo (pull request #22), where that change lives until it is merged.
- Both open on the tour without a second copy of the code: the host's DEMO_START_ROLE setting does it, or ?role=presenter in the address (START_ROLE in js/brand.js stays 'worker').
- A Claude session cannot create the host itself: the Cloudflare project needs Adam's own account, and the GitHub API path for Pages is blocked through the session's proxy (checked 5 Nov 2026).

## Half finished

- The public copy: both branches are on GitHub (pushed 5 Nov 2026, after Adam approved it in the chat). The Cloudflare Pages project serves it (live since 5 Nov 2026). No Issues were filed: no step is unfinished.
- agents/engineer.md: the paragraph for the nightly engineer run is added on this branch (end of the file). The engineer's scheduled task exists since 5 Nov 2026 (daily, 2:11 am Sydney), but it reads its brief from main, so the paragraph takes effect only once this pull request is merged.

## Known limits

- The "View as" menu cuts off the long role names on narrow phones; the full name shows when the menu opens.
- The checker cannot judge how strong an argument is. Melvin does (tour claim 3 shows this).
- The practice-side demo is the client portal demo (site/demo/portal/, in its own pull request, on top of this one). The last tour step links to it when the host sets DEMO_PORTAL_URL.
- Logo B and the company name are not shown (placeholder), until the domain is bought.

## Next three actions

1. Adam pastes the public demo link (in the private project notes) into the YC form, after opening it once in a private window.
2. Melvin reviews the coach panel advice, the ten checks and what he would send back (checklist in the pull request).
3. After Melvin's notes: fix what he sends back, rerun score_demo.mjs and the browser tests, and refresh the Pages branch.
