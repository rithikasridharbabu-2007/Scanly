# Manual testing checklist

Use this when the team has permission to review the Hackathon website by hand. An automated Scanly result is a starting list. A scan with no violations is not a pass, and it does not prove WCAG compliance.

Record the page URL, the date, the browser, and who tested. Keep confirmed problems separate from items that still need a person to check.

## Before testing

- Test a public page the site owner agreed to share. Do not scan login, local, or private addresses.
- Use the latest Scanly report for that URL beside this checklist.
- Confirm each high-severity finding on the live page before recommending a change.

## Keyboard only

- Unplug the mouse or do not use it.
- Tab from the top of the page to the end, then Shift+Tab back.
- Every interactive control can be reached in an order that follows the visual page.
- The focused control is always visible. The indicator is not color alone and is not hidden by the header, a menu, or the edge of the screen.
- Enter or Space activates the focused link or button.
- Escape closes any open menu or dialog, and focus returns to the control that opened it.
- Focus never gets stuck in a menu, dialog, or player.
- Form fields can be filled and submitted without a mouse.

## Screen reader

- Check with VoiceOver or NVDA. One pass is enough for the pilot.
- The page title and main heading describe the page.
- Headings follow a sensible order and can be jumped through.
- Images that convey information have useful alternative text. Decorative images are skipped.
- Links and buttons have names that make sense without the surrounding text.
- Form fields have labels. Required fields and errors are announced after an invalid submit.
- Status messages, such as a successful submit or a loading state, are announced without moving focus unexpectedly.

## Vision, zoom, and small screens

- Check at 200% browser zoom and at a phone width, about 390 pixels.
- Text does not overlap, get clipped, or require horizontal scrolling for a single column of content.
- Text and control labels meet contrast against their backgrounds, including text on images and buttons.
- Information is not conveyed by color alone. Errors also use text.
- Turn on reduced motion. Nothing flashes or moves in a way that blocks the task.

## Afterward

- Write down what was found, what was confirmed, what was a false alarm, and what the automated scan cannot judge.
- Share suggested fixes with the site owner and record which changes they accept.
- Scan again only after those changes are published, then compare the counts.
