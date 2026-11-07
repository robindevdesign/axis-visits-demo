# Supabase setup

The migration creates the shared MVP tables, role-based row-level security, a private booking attachment bucket, an in-app notification inbox, and per-device Web Push subscriptions.

## Current project status

- Project ref: szqqcbtfdkknhmhhelqi.
- The initial migration in migrations/20261107000000_initial_schema.sql has been applied.
- All 12 application tables were confirmed present with row-level security enabled.
- The first Auth account is confirmed and its profile has the SUPER_ADMIN role.
- An active VP account is still required before creating visits. Invite VP users in Authentication → Users, then assign the VP role to their profile from the SQL Editor.

## Auth URL configuration

After publishing the app, open **Authentication → URL Configuration**:

1. Set **Site URL** to https://robindevdesign.github.io/axis-visits-demo/.
2. Add that URL to **Redirect URLs**.
3. Add http://localhost:8000/** for local email sign-in and password recovery links.

The Site URL is the default destination for Auth email links. The PWA page must be available at the redirect destination to finish password recovery and invitation setup.

## Credential handling

- The project URL and publishable client key are used by the browser app. Row-level security protects the database.
- Never add the database password, service-role key, VAPID private key, or push authentication secrets to the GitHub repository or browser code.
- Auth, shared visit data, and private attachment storage are connected to the PWA. The PWA can request browser notification permission, but push subscriptions and message delivery still need to be connected. In-app invitations are not implemented yet.
