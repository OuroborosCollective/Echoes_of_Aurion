- For accessibility and UX on Landing Pages and Overlays: Ensure interactive elements have explicit focus/hover states (e.g. `focus-visible:ring-2`) and use `aria-busy` attributes paired with textual cues (e.g. 'Wird geladen...') when asynchronous network actions (like login, chat submit, forum posts) are processed.
## 2026-09-09 - Added aria-label to AIChatBox Input and Button
**Learning:** Found that the custom `AIChatBox` component lacks ARIA labels on its `Textarea` and `Button` components.
**Action:** Added `aria-label={placeholder}` to the `Textarea` and `aria-label="Send message"` to the `Button`. Always verify icon-only buttons have accessible names for screen readers.
