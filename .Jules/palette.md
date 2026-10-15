- For accessibility and UX on Landing Pages and Overlays: Ensure interactive elements have explicit focus/hover states (e.g. `focus-visible:ring-2`) and use `aria-busy` attributes paired with textual cues (e.g. 'Wird geladen...') when asynchronous network actions (like login, chat submit, forum posts) are processed.

## 2024-10-15 - ARIA and Title on Icon-Only Buttons
**Learning:** Icon-only buttons (like the `ArrowLeft` back button in `AurionOpenWorldRuntime.tsx`) often rely entirely on a screen-reader-only child element (`<span className="sr-only">`) to provide context, leaving sighted mouse users without a tooltip.
**Action:** Always provide an explicit `aria-label` (to correctly override the implicit name and describe the action cleanly) alongside a `title` attribute to provide a native browser tooltip for sighted users.
