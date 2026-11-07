# Axis Visits — local MVP

A lightweight, responsive browser MVP for planning Axis Lighting customer visits. The interface is in English and uses the official Axis wordmark, charcoal, white, and lime accents, architectural lighting imagery, and editorial typography. The logo SVG is bundled locally as `axis-logo-black.svg`.

## Run it locally

Serve the folder over HTTPS or on `localhost` to enable PWA installation and offline caching. For local development, start the static server from this folder:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000>. There are no build steps or package installs.

## Included flows

- List and calendar dashboards with search, status filters, and Needs Review filters.
- Quick visit creation, visit details, destination/date editing, team assignment, status changes, archive and restore.
- Guardrails for moving a visit to Upcoming until destination and dates are complete.
- Guest management with attendance statuses and a Needs Review prompt when a guest cancels.
- Flight, hotel, transportation, restaurant, and activity bookings.
- Multiple flight segments and individual hotel stay dates per guest.
- PDF and image attachments on bookings, with local download and removal.
- Booking status and progress summaries, a persistent Needs Review counter, and per-visit activity history.
- Sample workspace data and a reset action in Workspace Settings.
- Installable PWA shell with an app icon and offline-cached interface files.

## Local prototype boundaries

Visit data and attachments are saved in this browser's local storage and stay on this device. Attachments are limited to 500 KB each to fit browser storage. The PWA currently caches the interface for offline loading; it does not sync or save edits made offline. The role selector previews the Super Admin, VP, and Sales views; it is not an authentication or server-side permission system. User invitations, password reset, shared storage, push notifications, and production security are not connected in this MVP.

The initial Supabase schema and row-level access policies are prepared in `supabase/migrations/`; they have not been applied to a Supabase project or connected to the app yet. Setup notes are in `supabase/README.md`.

Use sample or non-sensitive information here. The existing `AXIS_VISITS_SPECIFICATIONS.md` remains the full reference for the eventual production implementation.
