# Supabase setup

The migration creates the shared MVP tables, role-based row-level security, a private booking attachment bucket, an in-app notification inbox, and per-device Web Push subscriptions.

## Current project status

- Project ref: szqqcbtfdkknhmhhelqi.
- The initial migration in migrations/20261107000000_initial_schema.sql has been applied.
- The event-team guest link migration in migrations/20261107234200_event_team_guests.sql has been applied.
- All 12 application tables were confirmed present with row-level security enabled.
- The first Auth account is confirmed and its profile has the SUPER_ADMIN role.
- An active VP account is required before creating visits. After deploying the invitation function, Monse can invite VPs and Sales reps from Workspace Settings, while VPs can invite Sales reps.

## Auth URL configuration

After publishing the app, open **Authentication → URL Configuration**:

1. Set **Site URL** to https://robindevdesign.github.io/axis-visits-demo/.
2. Add that URL to **Redirect URLs**.
3. Add http://localhost:8000/** for local email sign-in and password recovery links.

The Site URL is the default destination for Auth email links. The PWA page must be available at the redirect destination to finish password recovery and invitation setup.

## Credential handling

- The project URL and publishable client key are used by the browser app. Row-level security protects the database.
- Never add the database password, service-role key, VAPID private key, or push authentication secrets to the GitHub repository or browser code.
- Auth, shared visit data, and private attachment storage are connected to the PWA. The PWA can request browser notification permission and send a local test notification, but remote push subscriptions and message delivery still need to be connected.
- The migration `migrations/20261108100000_sales_client_permissions.sql` adds Sales access to guest records for assigned, active visits. Apply migrations in timestamp order before publishing the matching app build.
- The migration `migrations/20261111120000_guest_intake_and_sales_flight_edits.sql` adds client profile fields, lets assigned reps create or edit flight details, and adds database-backed in-app notifications when Monse assigns a visit. Apply it before using this build with authenticated Supabase accounts.
- The local `?demo=1` mode simulates sample accounts and guest-only questionnaire/travel-guide pages. It does not send email or push. Shared public guest links still require server-side guest tokens, a public form/guide Edge Function, and an email provider; do not store public bearer tokens in the browser or expose the full guest table to the anon role.
- Deploy `functions/invite-team-member/index.ts` as the `invite-team-member` Edge Function to enable Workspace Settings invitations. It uses Supabase's server-side secret environment; never add that key to the browser app or repository.
