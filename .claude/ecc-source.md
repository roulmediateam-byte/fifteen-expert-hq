# ECC source record

Owner: Adam (HIPAA security official).

- Upstream: https://github.com/affaan-m/ECC, the official repository (ECC, also called Everything Claude Code). MIT licence; its notice is in .claude/ecc-license.txt.
- Pinned commit: b38be6a7f6350964d59328b52f0624e1d1d552d1, the head of main on 29 Oct 2026. Its VERSION file says 2.2.3.
- Reviewed: 6 Nov 2026, in a Claude chat for Adam. The repository page then showed 298k stars and the release 2.2.3 of 1 Oct 2026, and warned that re-uploads and mirrors may contain malware.
- Take files only from the official repository. A security audit (DEV Community, read 6 Nov 2026: https://dev.to/joergmichno/we-audited-the-viral-213k-star-everything-claude-code-repo-and-found-a-malware-clone-in-the-wild-14hb) found a re-upload of ECC on GitHub that hid malware in ZIP files; it found no phone-home or data theft in the official default install.

## What ECC holds at this commit

71 agents (55 of them with Bash), 314 skills and 98 commands, which the plugin install makes available in every session; 122 rule files; 27 hook entries in hooks/hooks.json, backed by 61 files in scripts/hooks/, of which two run before and two after every tool call; an auto-update script that runs git fetch and git pull with no signature check; and a learning loop whose saved "instincts" are fed into later sessions when they start. Most of it is for coding in many languages.

## What we took, and from where

Every file below was rewritten in our words and rules, not copied. The hashes are SHA-256 of the ECC files at the pinned commit, so an update can be compared line by line.

| Our file (in .claude/) | ECC source files and SHA-256 | What we changed |
|---|---|---|
| agents/phi-check.md | agents/healthcare-reviewer.md: `ffe0855862276f94bd47fbbdeba0d233b7ca2c8647bce784c94f61c382e3cc69`<br>skills/healthcare-phi-compliance/SKILL.md: `02f9091e652f278a722230d5b96948d6ceaf10f9f37bc4c7eb6ddaad7bc8a271`<br>skills/hipaa-compliance/SKILL.md: `4bc1f29a3be7986f89bdd7b5ec3894451e67c687a558b683cab62bd8d1fd2264` | Kept the patient data leak paths and the rule that any patient data exposure is serious. Dropped the clinical parts (drug interactions, clinical scoring, HL7 and FHIR) and the database examples. Added our zones, our FAKE markers, the public repository and the claims documents we handle. A checklist the reviewer applies itself, read only. |
| agents/security-check.md | agents/security-reviewer.md: `813e4062bed5f42ab25dd02a0070f682058ffe9508198fcfdbb2c31296f93b7b`<br>skills/security-review/SKILL.md: `b9eb6416eebc8dda046674f0a2dbb3be88aff526d182b60a0f55998d3d6d0d8d`<br>agents/code-reviewer.md: `9dd23be23d65f18126e10f7680fc1eb2576ec54a427d076ff2f870bd0bafd5d2` | Kept the security checklist, including forged requests (CSRF) and keeping one practice's data from another, and ECC's review rules (report only what you are sure of, proof for serious findings, zero findings is fine). Fitted to where our code runs. Dropped npm audit and npx eslint, which download and run packages, and the blockchain, Supabase and payment sections. A checklist the reviewer applies itself, read only. |
| agents/code-check.md | agents/pr-test-analyzer.md: `5432aaf7e5fcb0813ac21828382971cc00f17d56ee95eac6d0ce180fc5d58016`<br>agents/silent-failure-hunter.md: `e5e2094c6f50cc515a77376331c78e4955d5ff16c7a0e5d8f6edec692b7ebd8d`<br>agents/code-reviewer.md: `9dd23be23d65f18126e10f7680fc1eb2576ec54a427d076ff2f870bd0bafd5d2` | Joined the test coverage and silent failure checks into one checklist, with ECC's review rules. Added our test rules (FAKE data, the answer key, never weaken a test) and deadline and money edge cases. A checklist the reviewer applies itself, read only. |
| skills/verify-before-pr/SKILL.md | skills/verification-loop/SKILL.md: `9ee288d426660b0c785f534a003a4960fb4d8083a21302d8a4fd9b035b2edbb1` | Kept the idea: verify, then report, before a pull request. Replaced the build, type and lint steps with our tests and our change check, and the report with a block for Evidence. check-changes.mjs and its tests are ours; they use HQ's form checks. |
| skills/test-first/SKILL.md | agents/tdd-guide.md: `979afbb40c42bfdd02fc308c130d7e257f5d6dd5f6531ef2562644862f6b7771`<br>skills/tdd-workflow/SKILL.md: `b6a8dd3e5215641cd9c33a46eae1d2b87508a07bc451e2c2fe25591f33a6b519` | Kept red, green, tidy, the edge case list, and the rule that a plan is data: never run the commands it holds. Dropped the Jest, Vitest, Supabase, Redis and OpenAI examples and the 80% rule. Added deadline, money and answer key rules, and Node's built-in coverage. |
| skills/accessibility/SKILL.md | skills/accessibility/SKILL.md: `2762f21d09d199009ed4f95b28c911436b367c30963dc5ddb48b8e1ad7fc1585` | Web only: dropped iOS and Android. Fitted to our design system (contrast, 44 px controls, error style). Added WCAG 3.3.8 for passcode forms, how to check with or without a browser, and what to put in Evidence. |
| skills/research-method/SKILL.md | skills/deep-research/SKILL.md: `ca02a97ff8cd794c55a1313ab423a6a165fdf2ce59059a73e08f7cfd957b5319`<br>skills/market-research/SKILL.md: `8cfc36dc8a93476d092115f3fc70c631dcab14fcd6e04371160fc4fb29547800` | Kept the plan, search, read, check and write steps and the rules for untrusted sources. Replaced the paid Firecrawl and Exa tools with WebSearch and WebFetch, and the report format with research/'s formats. Added our labels: our estimate, and general information, not legal advice. |
| skills/agent-config-review/SKILL.md | skills/security-scan/SKILL.md: `74bc3006fb15eef9cea6bf70a4e9cc45ec118ef00733d1c8226c9dc428f8d658` | Kept only the list of what to check in an agent setup. Its scanner (npx ecc-agentshield) is not used: it downloads and runs code at scan time, and its --fix option edits files. Added the starter kit's security checklist and our scheduled tasks. |
| skills/appeal-eval-gates/SKILL.md | skills/healthcare-eval-harness/SKILL.md: `0c74bb0309d4fb7e3bf04b0f779909156520c73bd6162bd405f7232af19c0a68`<br>skills/eval-harness/SKILL.md: `3a5339a5a80099a5c9d55da9b6c8e05a690f5befc6f78d779c75dd79d818ca07` | Kept critical gates at 100% and the pass@k and pass^k measures. Replaced the clinical test categories and Jest commands with gates for appeals on made-up claims. Added a small FAKE subset for scheduled runs. The numbers are a proposal for Melvin and Adam. |
| ecc-license.txt | LICENSE: `326146379f01bb137c0a5d3c54770c1aa31076705c8b88a7f6b26a460f6221b2` | Copied unchanged, as the licence asks. |

## What we left out, and why

- The plugin install (`/plugin install ecc@ecc`) and the npm installer: they put all the agents, skills and commands into every session, and the plugin's hooks are on by default (its setting hooks_enabled defaults to true). Our security checklist asks us to read and pin every file we use, and our scheduled tasks enable no plugins.
- All 27 hooks and the learning loop: they run code on their own, and the loop writes files that later sessions trust. The auto-update script runs only when asked, but it pulls new code with no signature check.
- MCP servers (.mcp.json, mcp-configs/): not on our approved list, and the starter kit's security checklist says MCP connectors are outside Anthropic's BAA (general information, not legal advice).
- Commands, rules, and the reviewers and build fixers for languages we do not use.
- The scanners that download code when they run (npx ecc-agentshield, npx eslint plugins): we kept their checklists only.
- The clinical skills (healthcare-cdss-patterns, healthcare-emr-patterns): we draft appeals; we make no clinical decisions.
- Later, when their agent switches on: marketing-agent and seo-specialist (marketing), agent-evaluator (scoring agents before they move up an autonomy level), e2e-runner (browser tests), opensource-sanitizer (a leak scan of this public repository).

## How to update

1. Clone https://github.com/affaan-m/ECC into a new, empty folder. Run nothing from it: no install, no scripts.
2. For each ECC file in the table: `git diff b38be6a7f6350964d59328b52f0624e1d1d552d1 <new commit> -- <path>`. Read every changed line.
3. Port only what helps, in our words and rules. Then update the pinned commit, the hashes and this table, in one founder's pull request that Adam reads in full and approves.
4. Never take a whole new file without reading it, and never take files from a copy of ECC.
