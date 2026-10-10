# Design — RMC Delivery

Locked design system for this app. Scope of this revision: responsive phone and iPad
layouts. Visual identity (palette, fonts) is preserved from the existing code, not
re-picked. Amend this file before overriding it in a component.

## Genre
modern-minimal (operational dashboard: dispatch, live trip, lists).
Tone: utilitarian. Glanceable, dense, legible in a truck cab.

## Audience and use case
- Drivers on phone, dispatchers on iPad and desktop.
- Phone and iPad job: schedule and monitor deliveries.
- Real GPS tracking stays available. GPS status, remaining distance, speed,
  traffic message and GPS errors are never hidden at any width.

## Macrostructure family
Hallmark's macrostructures are landing-page shapes; none is a native app shell.
Closest fits, recorded as a deliberate stretch:
- Map pages (Dispatch, Live Trip): 19 Map / Diagram. The map is the page; one panel
  holds the controls.
- List pages (Trips, Plants): 11 Catalogue. Cards below 48rem, table from 48rem.

## Layout by breakpoint (mobile-first, rem breakpoints)
| Width | Nav | Panel (Dispatch / Live Trip) | Map |
| --- | --- | --- | --- |
| base (phone) | bottom tab bar: Dispatch, Live Trip, Trips, Plants | bottom sheet: collapsed / half / full | full height |
| 48rem (iPad portrait) | bottom tab bar (same four tabs) | same sheet, max 36rem wide, centred | full height |
| 64rem (iPad landscape, small laptop) | 4rem icon rail with labels | docked 340px aside | beside panel |
| 80rem (desktop) | 13rem labelled sidebar (current) | docked 380px aside (current) | 65% + route info below (current) |

At 80rem and above the layout must be visually identical to today.
One DOM tree per panel. Stateful forms (DispatchPanel) are mounted once and only
restyled by breakpoint, never rendered twice.

## Theme (preserved from tailwind.config.ts, no new palette)
Source of truth: `tailwind.config.ts` `theme.extend.colors`.
- primary `#6750a4`, on-primary `#ffffff`, primary-container `#eaddff`
- surface `#fef7ff`, surface-container `#f3edf7`, surface-container-low `#f7f2fa`
- on-surface `#1c1b1f`, on-surface-variant `#49454f`
- outline `#79747e`, outline-variant `#cac4d0`
- error `#b3261e`, md-blue `#1a73e8`, md-green `#1e8e3e`, md-red `#ea4335`, md-yellow `#fbbc04`
New UI uses these Tailwind tokens only. No inline hex in new code.

## Typography (preserved)
- Google Sans, Roboto fallback, single family. Known deviation from Hallmark's
  pairing rule, out of scope for this revision.
- Inputs are 16px on touch devices (prevents iOS focus zoom).
- Headings roman, no italic.

## Spacing
Tailwind default scale. Named steps only, no raw px in new code except the 48px
touch minimum and the fixed panel widths above.

## Touch and pointer rules
- `pointer: coarse`: interactive targets at least 48px; inputs and selects 48px tall.
- Hover styles apply only where hover is supported (`hoverOnlyWhenSupported`).
- Every hover affordance has a tap and keyboard equivalent.
- Clickable labels never wrap (gate 49): shorten, then `whitespace-nowrap`.
- Heights use `dvh` with a `vh` fallback; bottom bars and sheets respect
  `env(safe-area-inset-bottom)`; viewport uses `viewport-fit=cover`.
- Map container resizes call `invalidateSize` (ResizeObserver).
- No separate Map tab: Live Trip and Dispatch are the map views; collapsing the sheet
  shows the whole map.
- lg+ nav collapses to an icon rail; choice persists in localStorage.
- Short landscape phones (height under 32rem, width under 64rem): header hidden.

## Motion
Motion-cut. State changes are instant; transitions use transform and opacity only,
with `prefers-reduced-motion` collapsing to at most 150ms opacity. No new
animation libraries. The sheet header handles tap and a vertical swipe on its handle
(pointer events, no library).

## Interactive states
Nav tabs, sheet header buttons, card action buttons: default, hover (where supported),
`:focus-visible` ring (existing global rule), active, disabled where applicable.
Loading / error / success states stay with the existing components that own them.

## CTA voice (unchanged)
Primary: filled `bg-primary text-on-primary rounded-xl`. Secondary: outline
`border-outline-variant rounded-xl`. Destructive: `md-red` outline, filled only on confirm.

## What pages MUST share
Header wordmark, accent colour and placement, Google Sans, button voice, the
panel + map pattern, the 48px touch rule.

## What pages MAY differ on
Panel content, card vs table presentation of the same list data.
No enrichment, no decorative imagery on app pages.

## Known exceptions
- `html, body { overflow: hidden }` (globals.css): app shell with inner scrollers.
  Gate 34 asks for `overflow-x: clip`; kept because every scroll region is internal.
- Pre-existing inline hex in MapView and MapOverlay, and the hotlinked truck icon:
  out of scope here.
- `src/app/plants/page.tsx` is not linked from anywhere and duplicates PlantsPanel.
  Not touched; decision pending with the owner.

## Exports
No parallel token file is emitted. Tailwind config is the single token source and a
second set would shadow it (see Hallmark contract: reuse the project's token names).
