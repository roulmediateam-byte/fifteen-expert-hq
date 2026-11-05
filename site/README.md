# site

Owner: Adam. The design agent (label agent:design, human owner Adam) owns everything here except site/demo/, which the engineer agent (label agent:engineer, human owner Adam) owns.

What goes here: the website. The Cloudflare Pages project fifteen-expert-site serves this folder (see Hosting), and each design branch gets its own preview link. The home page is site/index.html. Pages are self-contained HTML, readable on a phone, with the values they need copied from brand/design-tokens.css.

Rules: no made-up results or testimonials, every number has its source, and no patient data or private person's details. Nothing is published without Adam's approval. The company name, logo and domain never go in this folder (CLAUDE.md): Cloudflare adds them when it builds the site.

## Hosting

Set up on 5 Nov 2026, in Adam's Cloudflare account (free plan):

- Project: fifteen-expert-site, https://fifteen-expert-site.pages.dev. It builds this repository and serves site/.
- Production branch: claude/site-pages for now, a copy of a checked commit of the website branch. Refresh it after each checked change with `git push origin <commit>:refs/heads/claude/site-pages`. Agents never push to it. Once pull request #12 merges, switch the production branch to main and delete claude/site-pages.
- Preview branches: claude/design-* only, so each design pull request gets its own preview link.
- Build command: `test ! -f site/scripts/hosted_settings.mjs || node site/scripts/hosted_settings.mjs`. Build output directory: site. Framework preset: None. Root directory: empty.
- Settings, for Production and Preview: COMPANY_NAME (the name); BRAND_LOGO and BRAND_ICON (logo B's logo and its small-size icon, from the brand/ folder of the Claude Project, each made with `gzip -9 -n -c <file> | base64 -w0`); BOOKING_URL, once there is a real booking page. site/scripts/hosted_settings.mjs explains each one.
- site/_headers keeps search engines out until launch (X-Robots-Tag: noindex), together with the robots line in index.html.
- Tests: `node --test site/scripts/hosted_settings.test.mjs`.
