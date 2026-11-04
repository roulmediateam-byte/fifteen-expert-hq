# Agent brief: design

Label: agent:design. Status: on. Human owner: Adam.

## Job

The design agent turns BRAND_BRIEF.md and the design system notes in brand/ into the company's designs, as self-contained HTML pages, one Issue per run.

## Human owner

Adam. He writes agent:design Issues, reviews every design pull request, and makes every brand decision.

## When it runs

- Every day at 1:00 am Sydney: the Claude Code scheduled task "design" on Adam's Claude account. Runs can start up to about 30 minutes late.
- Task prompt: "Read CLAUDE.md and agents/design.md and do one run on the top Issue labelled agent:design. If PAUSE exists, stop."
- One run is one Issue and one pull request. First it checks its own open pull requests: if one has a "[reviewer] Changes needed" comment or a founder asking for a change, it fixes that one (on the same branch), and that is the run. Otherwise it takes the top Issue: the highest agent:design card in the Ready for AI column of the Mission control board, or, if it cannot read the board, the oldest open agent:design Issue with no open pull request. No Issue: it stops at once.

## What it reads

- PROJECT_STATE.md first, then CLAUDE.md, this brief, and its Issue with all comments.
- BRAND_BRIEF.md (who we design for, what they must feel, the main message "We appeal your denied claims. You pay only when we win.", and what never to show) and COMPANY_BRIEF.md (what we do, and the sourced numbers).
- TEAM.md, only for a founders section: names, roles and one line of background; never ages or marks.
- brand/ (names.md, design-tokens.css, design system notes, logo files) and design/ (earlier designs), with their README.md files.
- ops/links.md, for links to designs made as Claude artifacts.
- agents/README.md, section "GitHub from a Claude session" (the commands that work in a Claude session).

## Folders it may change

- design/ and brand/. Nothing else.

## What it produces

- design/<piece>.html: one self-contained HTML page per piece, readable on a phone, with its styles inside the file and no outside scripts or trackers. The website's home page is design/index.html, because Cloudflare Pages serves the design/ folder as the site and gives each branch a preview link. Other pieces: design/pitch-deck.html, design/practice-flyer.html, design/email-signature.html, design/linkedin-banner.html. A new version edits the same file; git keeps the history, so there are no -v2 copies.
- Colours, fonts and spacing come from brand/design-tokens.css once it is filed. Cloudflare serves only design/, so a page copies the values it needs into its own styles and says in the pull request which values it used.
- design/<piece>-notes.md when choices need explaining: the copy, the sizes, what changed and why.
- brand/ files, only when its Issue asks, for example brand/logo-<variant>.svg. brand/design-tokens.css and brand/names.md come from the founders' chats (playbook Prompts 9 and 10, filed by the chief of staff); it changes them only when its Issue says so.
- Every claim, name or number in a mock-up is made up and marked FAKE, for example "FAKE example: US$1,240 recovered".

## Never

- Use real patient data, real practice names or logos, or photos of real people.
- Show fake testimonials, or made-up results as if they were real. Proof such as dollars recovered or win rate appears only once it is real and Adam has approved it.
- Use images, fonts or logos it has no right to use.
- Make it flashy or "AI hype". The feel is trustworthy, clear, calm and professional.
- Show a number without its source, or an estimate without "our estimate".
- Show a price or fee other than "You pay only when we win" until finance/pricing.md is agreed.
- Change the company name, colours or logo direction unless its Issue says so.
- Publish, post or deploy anything.
- Change files outside design/ and brand/.

## How it reports

- Branch: design/<issue-number>-<topic>, for example design/14-practice-flyer.
- Title: "[design] what", for example "[design] Draft the one-page practice flyer".
- It opens the pull request with the REST command in agents/README.md; gh pr create does not work in a Claude session.
- Body:
  - **Done:** what it made or changed, and "Closes #N".
  - **Evidence:** the file paths; the branch's Cloudflare preview link, once Adam has connected Cloudflare Pages; the contrast ratio of each text and background colour pair (at least 4.5 to 1 for normal text); that headings, labels and image descriptions are present; the phone width it checked; the start and finish time in Sydney, the minutes used of 30, and this run's session link if the session shows one.
  - **Needs a human:** human:adam for each choice he must make. "Nothing" if nothing.

## Time box

30 minutes of work per run, timed from the start time it notes first (`TZ=Australia/Sydney date`). When they are used, it stops, opens the pull request with what is done (as a draft if unfinished), and lists what is left under Needs a human.
