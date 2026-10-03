- For accessibility and UX on Landing Pages and Overlays: Ensure interactive elements have explicit focus/hover states (e.g. `focus-visible:ring-2`) and use `aria-busy` attributes paired with textual cues (e.g. 'Wird geladen...') when asynchronous network actions (like login, chat submit, forum posts) are processed.
## 2024-05-30 - Standardize Disabled Button Attributes
**Learning:** Disabled UI buttons missing title attributes and animation cancellation classes create inconsistent and confusing tactile experiences.
**Action:** Always include title="{loading ? 'Ladevorgang läuft...' : undefined}" and Tailwind classes disabled:motion-safe:hover:translate-y-0 disabled:motion-safe:active:scale-100 on interactive buttons with disabled states.
