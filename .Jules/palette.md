- For accessibility and UX on Landing Pages and Overlays: Ensure interactive elements have explicit focus/hover states (e.g. `focus-visible:ring-2`) and use `aria-busy` attributes paired with textual cues (e.g. 'Wird geladen...') when asynchronous network actions (like login, chat submit, forum posts) are processed.

## 2024-05-18 - Ensure Context for Disabled Network Actions
**Learning:** While `aria-busy` communicates a loading state to screen reader users, sighted users relying on hover tooltips may lack context when an asynchronous network action (like a chat form submission) disables a button. This is especially true for icon-only buttons or forms without other loading indicators.
**Action:** When configuring disabled states on network-bound form submit buttons with `aria-busy`, ensure they also include explicit hover context using a dynamic visual `title` attribute (e.g. `title={sendChat.isPending ? "Wird gesendet..." : undefined}`).
