---
name: accessibility
description: "WCAG 2.2 level AA checks for our web pages (site/, design/, site/demo/, hq/, company/): structure, names and labels, keyboard and focus, contrast, target size, motion, forms and errors. Use when building or changing any page, and to fill the accessibility lines of a pull request's Evidence."
---

Adapted from ECC (skills/accessibility), MIT licence: .claude/ecc-license.txt. Web pages only.

# Accessibility (WCAG 2.2 AA)

Our readers include busy office managers on old laptops and phones, and people who use a screen reader or only a keyboard. The design system already sets colours, type and sizes: the Design system artifact listed in ops/links.md, and brand/design-tokens.css once pull request #12 is merged (it is not on main yet). This checklist covers the rest.

## Structure

- One h1 per page, and headings in order. Landmarks: header, nav, main, footer.
- Native elements first: a button is a button element, a link is an a element with an href. A div with a click handler needs a role and keyboard support, so avoid it.
- Lists are lists. Tables have header cells (th with scope).
- The page sets its language (lang="en").

## Names and labels

- Every form field has a visible label element. Placeholder text is not a label.
- Icon-only buttons have a text name (aria-label, or text hidden from sight but not from screen readers). Decorative icons have aria-hidden="true".
- Images have alt text that says what matters. Decorative images have alt="".
- Link text says where it goes. Never "click here".

## Keyboard and focus

- Everything works with the keyboard alone, in a sensible order.
- Focus is always visible (the design system's outline) and never hidden under a sticky header or panel (WCAG 2.4.11).
- A dialog keeps focus inside while open, closes with Escape, and returns focus to what opened it.

## Seeing and reading

- Text contrast at least 4.5 to 1 (3 to 1 for large text). Edges of controls, icons and focus rings at least 3 to 1. Use the design system's colours, and check every text and background pair you use.
- Status is never colour alone: always a word and an icon (Won, Denied, Due in 12 days).
- Text can grow to 200%, and the page reflows at 320 px wide with no sideways scroll.
- Motion respects prefers-reduced-motion. Nothing flashes.

## Touch and pointer

- Targets are at least 24 by 24 CSS pixels (WCAG 2.5.8). Our controls are 44 px tall.
- Anything you can drag also works with a click or a key.

## Forms and errors

- An error says what is wrong and how to fix it, in text next to the field, with "Error:" and an icon.
- A flow never asks for the same thing twice (WCAG 3.3.7).
- A login or passcode form never makes people solve, remember or retype something: paste and password managers work (WCAG 3.3.8, level AA). The Company view's passcode form is one.
- Updates such as saved, sent or filtered use a polite live region (aria-live="polite").

## How to check

- Tab through the page at 1280 px and 390 px wide in a browser, if the run has one. Note anything you cannot reach or see.
- With no browser, read the HTML and CSS instead: the tab order, the labels and the focus styles. Say so in Evidence.
- Run the folder's browser tests if it has them.
- In Evidence: the widths checked, each colour pair with its contrast ratio (agents/design.md asks for it), and "keyboard: every control reached", "keyboard: read from the HTML, not tried", or what was not reached.
