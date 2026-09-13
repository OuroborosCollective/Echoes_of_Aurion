# UX Learning: Disabled States\n\n- Added `disabled:cursor-not-allowed` (Tailwind) to disabled buttons (like in `Home.tsx` and `Community.tsx`) to provide better visual affordance that an action is currently unavailable.\n- Added `title` attributes on community buttons when they are disabled to give screen readers and hover states contextual explanations (e.g. 'Nur für angemeldete Explorer verfügbar').\n- Kept changes small and utilized existing Tailwind CSS classes, without adding new dependencies or custom CSS.

## 2026-09-12 - Tactile Feedback in Aurion Portal Interactive Elements
**Learning:** The Aurion Portal needs to provide cohesive tactile feedback on action buttons for better interactivity and visual clarity for users.
**Action:** Applied Tailwind classes `group`, `hover:-translate-y-0.5`, `active:scale-95`, and `transition-all` on action buttons and applied `transition-transform group-hover:scale-110` for internal icons within these buttons in `client/src/pages/Community.tsx`.
## 2026-09-13 - Tactile Feedback and Disabled States
**Learning:** Added tactile feedback with group hover scaling to icons on interactive elements, and ensured disabled buttons do not transition on hover/active states.
**Action:** Applied `group`, `hover:-translate-y-0.5`, `active:scale-95`, `transition-all` to interactive elements, `transition-transform group-hover:scale-110` to their icons, and `disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:active:scale-100` for disabled buttons in `Home.tsx`.
