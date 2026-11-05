# Page checklist: what every page we make must get right

1. Fonts: two only. Site Serif (from Source Serif 4, semibold) for headings, Site Sans (from Source Sans 3) for everything else, from the files in site/assets (pull request #12, also copied in hq/assets), with their SIL Open Font License 1.1 next to them.
2. Colours: copy the values from brand/design-tokens.css (tokens version 1, in pull request #12; the same values are at the top of hq/app.css) into the page's own styles; never invent a new colour.
3. Contrast: every text and background pair reaches at least 4.5 to 1 (3 to 1 for control edges); --ink-muted #55636f is the lightest text allowed. Check each pair and write the ratios in the pull request.
4. Status is always a word and an icon or dot together, for example a green dot and "Done"; never colour alone. The icon is aria-hidden, the word is read out.
5. Phone first: design at 390 px wide, then desktop. No sideways scrolling, tap targets at least 44 px, and a visible focus ring (--focus #1f5a9e).
6. Headings in order, a label on every form field and button, and a text description on every image.
7. No patient data, ever: no patient names, dates of birth, member IDs, records or real claim files. Every example is made up and marked FAKE, for example "FAKE example: US$1,240 recovered".
8. No company name, logo or domain until the founders say the domain is bought: the page reads the name from the Cloudflare setting COMPANY_NAME, or shows a plain mark.
9. Feel: calm, clear, trustworthy and professional, never flashy or "AI hype". Main message: "We appeal your denied claims. You pay only when we win." No other price, no fake testimonials, and no number without its source or "our estimate".
10. Self-contained: styles inside the file, no outside scripts or trackers, and nothing published without Adam's approval.
