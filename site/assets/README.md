# site/assets

Owner: Adam. The design agent (label agent:design) looks after these files. The engineer agent's demo page in site/demo/ may use them too.

What goes here: files the website needs besides its pages. Today: two web fonts, their licence, and the licence of the icons drawn inside site/index.html.

| File | What it is |
|---|---|
| site-sans-latin.woff2 | Source Sans 3 by Adobe, cut down to weights 400 to 600 and Latin letters. 27.7 KB. Named "Site Sans". |
| site-serif-semibold-latin.woff2 | Source Serif 4 by Adobe, cut down to weight 600, optical sizes 24 to 48 and Latin letters. 40.1 KB. Named "Site Serif". |
| ofl-source-sans-3.txt, ofl-source-serif-4.txt | The fonts' licence, the SIL Open Font License 1.1, copied unchanged. |
| lucide-icons-license.txt | The licence of the Lucide 1.59.0 icons (ISC, and MIT for the icons that came from Feather), copied unchanged. |

## Why the fonts have new names

The licence reserves the name "Source" for Adobe's original fonts. A cut-down copy counts as a changed font, so it may not use that name ([OFL: webfonts and reserved font names](https://openfontlicense.org/webfonts-and-reserved-font-names/)). So the copies are called "Site Sans" and "Site Serif". The copyright, trademark and licence notices inside each file are unchanged. General information, not legal advice.

The cut-down copies keep the site fast: 68 KB for both, against 597 KB for the two full fonts.

## How they were made (4 Nov 2026)

From the full variable fonts in the design system (google/fonts copies: Source Sans 3 version 3.052, Source Serif 4 version 4.004), with fontTools 4.55.3:

1. Keep only the weights the site uses: Sans 400 to 600; Serif 600, with optical sizes 24 to 48.
2. Keep only Google Fonts' "latin" characters: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD.
3. Keep fontTools' default OpenType features plus tnum, lnum, pnum, onum and case. Drop hinting.
4. Rename every font name record from "Source Sans 3" to "Site Sans" and from "Source Serif 4" to "Site Serif". Keep records 0, 7, 13 and 14 (copyright, trademark, licence) unchanged.
5. Save as WOFF2.

To add a weight or other letters, start again from the full fonts and follow the same steps.

Rules: only fonts and icons whose licences allow it. Keep each licence file next to what it covers. No tracking scripts or files from other sites.
