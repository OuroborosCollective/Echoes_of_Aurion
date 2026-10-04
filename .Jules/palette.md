- For accessibility and UX on Landing Pages and Overlays: Ensure interactive elements have explicit focus/hover states (e.g. `focus-visible:ring-2`) and use `aria-busy` attributes paired with textual cues (e.g. 'Wird geladen...') when asynchronous network actions (like login, chat submit, forum posts) are processed.

## 2026-10-04 - UI Tooltips und ARIA-Navigation
**Learning:** Icon-only Buttons (oder solche mit unspezifischem Text) benötigen explizite `title` Attribute für sehende Nutzer und passendes ARIA. Deaktivierte Buttons mit Hover-Animationen (wie `motion-safe:hover:-translate-y-0.5`) können durch `disabled:motion-safe:hover:translate-y-0` stabilisiert werden, was die UX im inaktiven Zustand deutlich verbessert.
**Action:** Füge beim Designen interaktiver UI-Elemente standardmäßig erklärende `title` Attribute und entsprechende negierende Utilities für disabled-States hinzu, um Verwirrung zu vermeiden.
