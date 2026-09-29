- For accessibility and UX on Landing Pages and Overlays: Ensure interactive elements have explicit focus/hover states (e.g. `focus-visible:ring-2`) and use `aria-busy` attributes paired with textual cues (e.g. 'Wird geladen...') when asynchronous network actions (like login, chat submit, forum posts) are processed.

## 2024-05-19 - Improved UI component states and accessibility
**Learning:** Icon-only buttons lack context for sighted users without titles, and toggleable buttons need `aria-pressed` for screen readers. Disabled elements using motion-safe classes can inadvertently animate.
**Action:** Added `title` tooltips to icon-only buttons, added `aria-pressed` to dock toggle buttons, and appended `disabled:motion-safe:hover:translate-y-0 disabled:motion-safe:active:scale-100` to the disabled loading button in Home.
