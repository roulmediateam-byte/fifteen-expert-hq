# Client portal demo: progress

FAKE: everything in this folder uses made-up claims. No real patient data.

Last updated: 5 Nov 2026, by a Claude session working for Adam.
Branch: claude/client-portal-demo, on top of claude/worker-console-demo (pull request #21), because the portal reads the worker demo's made-up claims and rules.
How to run and test: [README.md](README.md).

## Steps (from Adam's request of 5 Nov 2026: "create the client portal, and put it on Cloudflare as well")

| Step | What | State |
|---|---|---|
| 1 | Look first: any portal or practice-side code on any branch | Done: none (only the worker demo's tour step saying it does not exist yet) |
| 2 | Made-up data from the worker demo (scripts/make_portal_data.mjs) | Done |
| 3 | Screens: Home, Send denials, Appeals, Appeal, Needs you, Money, Reports, Your practice | Done |
| 4 | Presenter tour, practice switcher, Reset demo | Done |
| 5 | Hosted build step, README, this file | Done |
| 6 | Logic tests, browser tests, screenshots | Done |
| 7 | Link the worker demo's last tour step to the portal | See pull request |
| 8 | Pull request, pages branch, Cloudflare project | See pull request |

## Last results (5 Nov 2026)

- Logic tests (`node --test site/demo/portal/tests/logic.test.mjs`): 13 of 13 pass.
- Browser tests (`node site/demo/portal/tests/browser.test.mjs`), Chromium, 15 screens at each of 390, 320 and 1280 px: 0 console errors, no sideways scroll, nothing spilling out of the main column, no text under 4.5 to 1 contrast, a visible focus ring on every control reached with Tab (a self test proves both checks catch planted problems), and every screen reached by keyboard alone.
- Flows in the browser: a sample file read and added (3 appeals, 1 new record request), the record sent, a letter signed (C-1045), another practice's claim refused, 10 of 10 tour steps opened, Reset demo.

## Decisions

- Same claims as the worker demo, from the other side: data/portal.json is made from site/demo/worker/data/claims.json, never typed by hand. A test fails if it is stale.
- Made-up history matches the worker demo's own totals (61 decided, 41 won), so the two demos never disagree on numbers.
- A practice sees only its own claims. The presenter tour switches practice when a step needs it.
- The demo takes no files, only made-up samples, so nobody can put patient data into a public page.
- The company name, its address and the worker demo's address stay out of the repository: the host fills them at build time (scripts/hosted_settings.mjs). A test checks the portal's files hold neither the name nor a long dash; it keeps only a hash of the name.

## Known limits

- The "View as" menu wraps under the navigation at 1280 px, because the portal has seven sections.
- Practices cannot write messages to the claims team yet.
- The practice's side and the worker's side do not share state: an action in one demo does not show in the other.
- Logo B and the company name are not shown in the repository copy (placeholder), until the domain is bought.

## Next three actions

1. Melvin reviews the portal with the checklist in the pull request.
2. Adam opens the public portal link (in the private project notes) in a private window.
3. After Melvin's notes: fix them, regenerate the data if the worker demo changed, rerun both test files, and refresh the pages branch.
