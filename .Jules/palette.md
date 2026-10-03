- For accessibility and UX on Landing Pages and Overlays: Ensure interactive elements have explicit focus/hover states (e.g. `focus-visible:ring-2`) and use `aria-busy` attributes paired with textual cues (e.g. 'Wird geladen...') when asynchronous network actions (like login, chat submit, forum posts) are processed.
## 2025-02-15 - Disabled States with Tactile Feedback
**Learning:** Buttons with tactile feedback classes (`motion-safe:hover:-translate-y-0.5`, `motion-safe:active:scale-95`) can still animate when disabled if not explicitly overridden.
**Action:** Always append `disabled:motion-safe:hover:translate-y-0 disabled:motion-safe:active:scale-100` to prevent unintended animations in the disabled state, and include a `title` attribute for context.
## 2024-05-23 - Community Button Optimization
**Learning:** Icon-only and tactile feedback buttons should explicitly nullify hover/active animations and explicitly clarify the title behavior when disabled. For example, Community feature buttons should provide clear text cues for sighted users.
**Action:** Always add explicit `title` attributes that convey exact action ("Forum öffnen", "Events öffnen") instead of generic undefined states or missing titles, and apply `disabled:motion-safe:hover:translate-y-0 disabled:motion-safe:active:scale-100` classes to negate tactile states on disabled buttons.
