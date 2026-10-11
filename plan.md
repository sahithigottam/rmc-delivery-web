# Mobile and iPad layout

System rules live in [design.md](design.md). Palette and fonts are unchanged.

## Layout

| Width | Navigation | Dispatch / Live Trip panel | Trips / Plants |
| --- | --- | --- | --- |
| Phone, iPad portrait (under 64rem) | Bottom tabs: Dispatch, Live Trip, Trips, Plants | Bottom sheet over a full-height map: half or full, swipe or tap the handle. Minimise hides it; a floating pill over the map brings it back. | Cards under 48rem, table from 48rem |
| iPad landscape (64rem+) | Left rail, collapsible | Docked 340px panel beside the map, with a Minimise button (map goes full width, floating pill restores the panel) | Table |
| Desktop (80rem+) | Labelled sidebar, collapsible | Docked 380px panel, map 65%, route info below (as before) | Table |

## Done
- Bottom icon tabs, collapsible left nav (choice saved in localStorage).
- Bottom sheet with a status header that always shows distance, speed, GPS error and traffic message.
- `dvh` heights, safe-area insets, 16px inputs and 48px touch targets on coarse pointers, hover styles only where hover exists.
- Map resizes with its container; route fits above the sheet.
- Trips and Plants as cards on phones; modals use `dvh` and dialog roles.
- Toast fits narrow screens; map overlay hidden below 64rem (the sheet header replaces it).

## Not done
- Check at 320, 375, 414, 768, 820, 1024, 1180 and 1440px, portrait and landscape, with Dispatch, Live Trip, Trips and Plants each in empty and populated states. Only 390, 820 and 1180px on Dispatch were looked at.
- Test on a real iPhone and iPad: `dvh`, safe areas, keyboard over the sheet.
- Keep the screen awake during Real GPS tracking (Wake Lock API). Not started.
- `src/app/plants/page.tsx` is unlinked and duplicates PlantsPanel. Not touched; delete or redirect?
- Out of scope, noticed: `dangerouslySetInnerHTML` on route step instructions in `page.tsx` (XSS risk if the backend text is untrusted); hotlinked truck icon in MapView.

## Run it
`localhost:3000` served a stale `next start` build. Use `npm run dev`, or rebuild and restart.
