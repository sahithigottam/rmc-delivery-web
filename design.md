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
- Full-height application shells use the shared `app-viewport` class, with
  `100dvh` declared after `100vh`. Do not combine Tailwind `h-screen` and `h-dvh`:
  generated utility order lets `h-screen` win and clips navigation under mobile
  browser toolbars.
- Map container resizes call `invalidateSize` (ResizeObserver).
- Minimise button (every width) hides the panel; a floating pill over the map shows
  distance, speed or traffic message and brings the panel back. Panel states: hidden,
  half, full (phone and iPad portrait); hidden or docked (64rem and up).
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

## CTA voice
Primary: filled `bg-primary text-on-primary rounded-xl`. Secondary: outline
`border-outline-variant rounded-xl`. Destructive: `md-red` outline, filled only on confirm.
Live Trip driver actions are the exception, because faint tints and outlines read
as white on the lavender card: forward actions (Start Trip, Resume, End Trip) are
solid `bg-md-green text-white`; Pause is solid amber `bg-md-yellow`; Cancel trip is
solid `bg-error text-white`. Red is used only for cancelling the trip.

## What pages MUST share
Header wordmark, accent colour and placement, Google Sans, button voice, the
panel + map pattern, the 48px touch rule.

## What pages MAY differ on
Panel content, card vs table presentation of the same list data.
No enrichment, no decorative imagery on app pages.
Map endpoints use local illustrated SVG markers: a batching plant for the origin
and a construction site for the destination. Their pin tips anchor to coordinates;
address popups and the existing live truck marker remain unchanged.
Automatic route framing includes the known driver position and respects the mobile
sheet, without additional location buttons. Refit on layout
changes and the first available driver position, not every GPS update; defer fitting
while the full sheet covers the map so lowering it restores usable bounds.

## Live trip map and voice
- The currently displayed trip is refreshed even while pending or opened from the
  trip list. Start/pause/end results invalidate older in-flight polls; older
  timestamps cannot overwrite newer state. Refresh failures are shown explicitly.
- The live driver panel prioritises remaining road distance, ETA, load time/status
  and GPS status. Stage actions stay ahead of secondary content: Start Trip,
  Start GPS, then End Trip. The existing completion flow retains succeeded/failed,
  required failure/expired-load notes and off-site review confirmation.
- The sheet header and the collapsed bar always show the live trip's distance,
  arrival time, stage (and any GPS problem) plus one next action: Start Trip,
  Start GPS, End Trip or Resume. The header action only opens the existing form
  or runs the existing action; completion checks are unchanged.
- An estimated arrival that has already passed (after a one-minute grace) is
  shown as "ETA outdated", never as a time, because the backend only refreshes
  it on a successful traffic check. No replacement time is guessed.
- A finished trip shows its result as a round mark and one line: green check
  "Delivered", red cross "Delivery failed", or a neutral dash for cancelled or
  unspecified. The review flag stays as its own amber note. The header and the
  collapsed card show the same result with one action, Back to trips, which clears
  the finished trip from Live Trip and opens the Trips list.
- Only the Simulation/GPS switch sits above the active trip card. The rest of
  the tracking settings (status, freshness, speed, progress, start/stop) live
  under More details. Switching modes stops the previous mode; starting GPS
  still requires the explicit Start GPS action.
- The collapsed trip card shows the headline, a dotted From/To route, a load
  window chip and the stage action. The load chip colour follows the minutes
  left (the load timer's thresholds), not only the backend status. Plus Codes
  are hidden from displayed addresses.
- On phones the route information drops raw coordinates, vehicle id/type,
  priority and the simulation status card. The desktop panel is unchanged.
- From/to addresses remain compactly visible. Secondary trip history and route
  information share one More details section.
  Only turn-by-turn steps retain their own accordion. Tracking settings scroll
  with details rather than occupying a fixed footer. Opening start/end forms
  expands the mobile sheet.
- Accordions share a subtle border/shadow and a right-aligned chevron pointing
  down when closed and up when open, with a minimum 48px header target.
- Live trips follow the driver at zoom 17 in the uncovered map area,
  including off-route GPS positions. Manual pan/zoom pauses following and resumes
  it 10 seconds after the last interaction ends. Further interaction restarts the
  wait; GPS fixes do not interrupt exploration. Non-driver route views preserve
  manual navigation without timed recentering.
- The original plant-to-destination route stays light purple; the remaining road
  path is dark purple, including backend reroutes and simulation progress.
- GPS distance uses remaining road geometry when within 150m of the path, otherwise
  the last backend remaining-distance estimate. Unknown distance says updating;
  it is never replaced with straight-line distance.
- Sound is off by default and opt-in per trip. It announces trip status, GPS errors,
  traffic/reroute messages and distance milestones at least two minutes apart.
  Muting, leaving the trip view or unmounting cancels speech immediately.
  Unsupported browsers and speech errors display explicit messages.
- Sound is one small round icon button on the map, under the route legend, like
  the zoom control. It is mounted once outside the sheet, shown for trips opened
  from the list, and hidden only while the sheet fully covers the map. There is no
  separate header row for it. Switching trips resets sound to off.
- These are status announcements, not turn-by-turn navigation. The backend currently
  reroutes for traffic thresholds, not explicit off-route detection.

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
