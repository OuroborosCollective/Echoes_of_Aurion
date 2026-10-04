- For accessibility and UX on Landing Pages and Overlays: Ensure interactive elements have explicit focus/hover states (e.g. `focus-visible:ring-2`) and use `aria-busy` attributes paired with textual cues (e.g. 'Wird geladen...') when asynchronous network actions (like login, chat submit, forum posts) are processed.

## 2024-10-24 - System Dashboard Loading States
**Learning:** Relying solely on React Query's `isLoading` fails to provide visual feedback for background data refetches, leaving buttons appearing active but unresponsive during network transit.
**Action:** Always destructure `isFetching` alongside `isLoading` on admin/status dashboards to ensure buttons (like 'Force Refresh' or 'Retry') provide explicit disabled/loading states during background refetches.
