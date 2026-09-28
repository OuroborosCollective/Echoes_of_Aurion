- For accessibility and UX on Landing Pages and Overlays: Ensure interactive elements have explicit focus/hover states (e.g. `focus-visible:ring-2`) and use `aria-busy` attributes paired with textual cues (e.g. 'Wird geladen...') when asynchronous network actions (like login, chat submit, forum posts) are processed.

## 2024-09-28 - Tooltips for icon-only buttons
**Learning:** While `aria-label` is sufficient for screen readers, visual users navigating via mouse or keyboard can be left guessing what an icon-only button does. A combination of both is optimal.
**Action:** Always include a visual `title` attribute matching the `aria-label` text on icon-only buttons to act as a tooltip for sighted users. Ensure the title text updates dynamically for interactive states like loading ("Wird gesendet..."). Also, ensure selectable elements like toggle buttons have the `aria-pressed` attribute for better context to assistive technologies.
