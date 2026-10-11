# Mobile Driver UX Review: Trips and Live Trip

Reviewed: 11 October 2026.

## Scope and limitations

This is a driver-first UX review of the current implementation and reported
usability problems, not a statement of Uber's internal design standards.
The shared browser was at sign-in, so the signed-in mobile screens were not
visually verified. These are recommendations, not implemented changes.

The existing utilitarian design system, palette and typography should remain.
The main issue is information hierarchy: the interface behaves too much like a
monitoring dashboard rather than a driver's working screen.

## Essential live-trip information

| Priority | Driver's question | Required information |
| --- | --- | --- |
| Essential | Where am I going? | Destination/site name, usable address and map |
| Essential | What stage is this trip in? | Pending, in progress, paused or completed |
| Essential | Is my location reaching the office? | Tracking health, not just GPS active |
| Essential | How long until arrival? | Remaining distance and clearly labelled arrival time |
| Essential for RMC | Is the load within its delivery window? | Load time remaining, expiry warning and actionable guidance |
| Contextual | What changed? | Important traffic, reroute or location-loss alert |
| Secondary | What are the job details? | Plant, mix, grade, volume, batch time and history |

Trip status, tracking status and load status must remain separate. A trip can be
in progress while GPS is off; GPS can be active while location uploads fail.

## Ranked findings

| Severity | Current problem | Recommendation | Implementation reference |
| --- | --- | --- | --- |
| Critical | Live Tracking can appear because polling has started, rather than because fresh driver locations are reaching the office. | Show truthful states: Tracking and sending, GPS unavailable, Locations waiting to send, or Trip updates unavailable. | [useTripStream.ts](src/hooks/useTripStream.ts), [MainApp.tsx](src/components/MainApp.tsx) |
| Critical | Opening an active trip from the list uses a separate viewed-trip mode, disabling driver-specific controls and map following. | Opening the driver's current trip should lead to the same working Live Trip experience. Other/historical trips should be clearly labelled viewing only. | [MainApp.tsx](src/components/MainApp.tsx) |
| Major | Full GPS/simulation settings precede the trip card, consuming valuable space. GPS status and Start GPS also appear again in the card. | Keep the requested switch at the top as a compact mode/status row. Show tracking controls once; put diagnostics and simulation speed below. | [SimulationControls.tsx](src/components/SimulationControls.tsx), [TripManagement.tsx](src/components/TripManagement.tsx) |
| Major | The half-height sheet has a large header plus scrolling settings and cards. Collapsing it hides trip actions. | Use a compact summary sheet with a persistent stage-action bar outside the details scroller. Expand for details or forms. | [MainApp.tsx](src/components/MainApp.tsx), [TripManagement.tsx](src/components/TripManagement.tsx) |
| Major | Trips opens with all statuses, newest IDs first, and multiple filters before cards. Export, Cancel and Delete compete with opening a job. | Prioritise current trip, upcoming jobs, then history. Keep advanced filters/export secondary and destructive actions away from the main card action. | [TripsListPanel.tsx](src/components/TripsListPanel.tsx) |
| Major | Manual map exploration ends automatically after ten seconds. | Prefer one contextual Re-centre button after manual exploration, not a row of map buttons. Resume following when the driver chooses. | [MapView.tsx](src/components/MapView.tsx) |
| Minor | Labels mix Start Trip/Begin Trip, Succeeded/Failed and Confirm. ETA can switch between clock time and minutes. | Use consistent language: Start trip, Complete delivery, Delivered/Not delivered, Save delivery, Arrive at and Drive remaining. | [TripManagement.tsx](src/components/TripManagement.tsx) |

Visual card-in-card treatment adds unnecessary boundaries around small metrics.
Flatten the summary rather than adding more containers.

Audit count: 2 critical, 4 major, 1 minor.

## Stage-specific actions

| Trip stage | Primary action | Secondary actions |
| --- | --- | --- |
| Pending, at plant | Start trip | Review batch time, retarder and destination; cancellation under secondary actions |
| In progress, tracking off | Start GPS | Complete delivery; clearly explain that the trip has already started |
| In progress, tracking healthy | Complete delivery | Sound and contextual Re-centre; Pause/Stop tracking under secondary actions |
| Paused | Resume trip | Clearly explain whether location tracking continues; cancellation secondary |
| Completing, while stopped | Save delivery | Delivered/Not delivered, notes, location confirmation and Back |
| Completed | Back to trips | Outcome, saved notes and review flag; no start/tracking controls |

Retain required failure notes, expired-load explanations and off-site review
checks. An expired timer must not imply that the app authorises pouring the load.
Guidance must follow the business's escalation policy.

Distinguish Pause trip from Pause simulation: they are different operations.

## Recommended mobile structure

From top to bottom:

1. Compact trip header: trip identity, operational status and sound.
2. Compact GPS/Simulation switch: selected mode and truthful tracking health.
3. Map: meaningful visible area, with Re-centre only after exploration.
4. Compact trip summary: destination, remaining distance, arrival time and load window.
5. Persistent primary action: appropriate to the current stage.
6. Expanded details: batch information, route steps, history and diagnostics.

Simulation must always look like a demo. Simulated arrival should say
"Simulation finished", not "Delivered!", and must not be confused with a saved
delivery outcome.

For Trips, each mobile card should prioritise destination/site, status and
schedule. Use Continue trip for the current trip and View delivery for completed
jobs. Show delivery outcome, not only Completed.

## Validation checklist

Test at 320, 375, 414 and 768 px, including keyboard-open completion forms:

- Trip stage, load warning and next action are discoverable without scrolling.
- Essential actions have at least 48 by 48 px touch targets.
- There are no duplicate GPS buttons or conflicting status messages.
- GPS loss, offline uploads and stale trip data produce distinct explanations.
- Opening the current trip from either tab gives consistent behaviour.
- Delivery notes survive failed submission.
- Map exploration is not unexpectedly interrupted.
- Drivers can complete core tasks while parked, one-handed, without hunting
  through sections.

## Recommended implementation order

1. Fix tracking-status truthfulness and current-trip navigation.
2. Simplify the sheet and pin its primary action.
3. Simplify Trips ordering, card actions and filters.
4. Validate the signed-in experience on mobile devices with drivers.

Additional styling alone will not resolve the reported usability problems.
