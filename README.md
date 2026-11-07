# Axis Visits — PWA MVP

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

## Shared workspace

The app now uses Supabase Auth and the Supabase database for signed-in users. Visits, guests, bookings, flight segments, hotel stays, activity, and booking attachments are shared across devices. Database access is protected by the project's row-level security policies. The publishable key in supabase-config.js is intended for browser use; never add a database password, secret/service-role key, or VAPID private key to the repository.

Supabase Auth sessions persist on the device. An internet connection is required to load or save shared data; offline edits are not queued. Booking attachments are stored in a private bucket and limited to 500 KB each. The app asks users to enable browser notifications, shows the permission state in Workspace Settings, and can display a local test notification on the device. Remote push subscriptions and message delivery, plus invitation management inside the app, are still future work; users are currently invited from the Supabase Dashboard.

The active Supabase project has the initial schema from supabase/migrations/20261107000000_initial_schema.sql. The first confirmed account has the SUPER_ADMIN role. At least one active VP account must also exist before the admin can create a visit, because every visit needs a VP lead.

## Supabase Auth URLs

After publishing this version, open Authentication → URL Configuration in Supabase. Set the Site URL to https://robindevdesign.github.io/axis-visits-demo/, then add that same URL to Redirect URLs. For local email sign-in links, also allow http://localhost:8000/**. The current PWA page must be available at the redirect destination for password recovery and invitation links.

The PWA shell may load offline, but shared data and authentication require a network connection. Setup notes are in supabase/README.md.
