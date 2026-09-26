# UX Learning: Disabled States\n\n- Added `disabled:cursor-not-allowed` (Tailwind) to disabled buttons (like in `Home.tsx` and `Community.tsx`) to provide better visual affordance that an action is currently unavailable.\n- Added `title` attributes on community buttons when they are disabled to give screen readers and hover states contextual explanations (e.g. 'Nur für angemeldete Explorer verfügbar').\n- Kept changes small and utilized existing Tailwind CSS classes, without adding new dependencies or custom CSS.

## 2026-09-12 - Tactile Feedback in Aurion Portal Interactive Elements
**Learning:** The Aurion Portal needs to provide cohesive tactile feedback on action buttons for better interactivity and visual clarity for users.
**Action:** Applied Tailwind classes `group`, `hover:-translate-y-0.5`, `active:scale-95`, and `transition-all` on action buttons and applied `transition-transform group-hover:scale-110` for internal icons within these buttons in `client/src/pages/Community.tsx`.
## 2024-09-13 - LocalAuthPanel button title
**Learning:** Added `title` attribute for disabled buttons to give context, plus styling `disabled:cursor-not-allowed` for better affordance.
**Action:** Apply this to other forms when adding UX enhancements.

## 2024-09-14 - LocalAuthPanel Interactive States & Tactile Feedback
**Learning:** The LocalAuthPanel's OIDC login button lacked a loading state when clicked, leaving users without feedback during navigation. Native `disabled` would remove the active redirect control from keyboard focus while that state is being announced.
**Action:** Added `oidcLoading`, `aria-busy` and focus-preserving `aria-disabled` with an idempotent click guard. Applied tactile feedback and `focus-visible:ring-2` while retaining the existing Aurion auth surface.

## 2024-09-14 - Tactile UI feedback respect for a11y (reduced motion)
**Learning:** Animations like scaling or translating elements on hover can cause dizziness or discomfort for users who have requested reduced motion at the OS level.
**Action:** When adding tactile feedback such as `hover:-translate-y-0.5`, `active:scale-95` or `group-hover:scale-110`, always prefix them with Tailwind's `motion-safe:` utility (e.g. `motion-safe:hover:-translate-y-0.5`). When clearing these on disabled elements, use `disabled:motion-safe:hover:translate-y-0` and `disabled:motion-safe:active:scale-100`. Apply `group-disabled:motion-safe:group-hover:scale-100` on internal icons. I updated `client/src/pages/Home.tsx` and its test file to verify this.

## 2026-09-15 - Landing and Community ARIA Improvements
**Learning:** Buttons that trigger dialog overlays (like the community and account panels) lacked semantic structure, and disabled states didn't fully account for loading transitions, causing poor screen reader experiences.
**Action:** Applied `aria-haspopup="dialog"` to buttons opening the Aurion panels and integrated `loading` states with `disabled` properties during initialization, extending `aria-busy` for explicit wait indications.
## 2024-09-22 - [AIChatBox Accessibility Improvement]
**Learning:** Icon-only buttons used for form submissions in reusable components like `AIChatBox` often lack visual tooltips and screen reader context, making them difficult to use for both sighted mouse/keyboard users and assistive technology users. Text areas without explicit labels also need `aria-label` attributes to ensure context is announced.
**Action:** Always verify that input fields without explicit `<label>` tags have `aria-label` attributes, and ensure icon-only buttons include both an `aria-label` for screen readers and a `title` attribute to provide a visual tooltip.
## 2026-09-23 - Disabled Loading States
**Learning:** Disabled portal actions need explicit loading semantics and contextual titles so assistive technology can distinguish authentication gating from an in-progress load.
**Action:** Keep `aria-busy`, loading-aware `title`, disabled opacity, and motion-safe disabled interaction states aligned across Home and Community.
## 2024-09-26 - Loading state attributes on CTA buttons
**Learning:** CTA buttons that transition into disabled loading states must maintain appropriate accessibility attributes (like `aria-busy`) and should cancel motion-safe transitions (using classes like `disabled:motion-safe:hover:translate-y-0`) to ensure consistent UX while blocked.
**Action:** Always verify that disabled buttons include `aria-busy`, contextual `title` text for loading states, and cancellation of interactive hover/active transforms.
