# Supabase setup

The migration creates the shared MVP tables, role-based row-level security, a private booking attachment bucket, an in-app notification inbox, and per-device Web Push subscriptions.

## Apply the initial schema

1. Create a Supabase project on the Free plan.
2. In the project dashboard, open **SQL Editor** and create a new query.
3. Copy the contents of `migrations/20261107000000_initial_schema.sql` into the query and run it once.
4. Create Monserrat's Auth user. The database trigger creates a matching profile with the safe default role `SALES`.
5. After confirming the email address, use the SQL Editor to promote her profile:

```sql
update public.profiles
set global_role = 'SUPER_ADMIN',
    first_name = 'Monserrat',
    last_name = 'Jimenez'
where lower(email) = lower('MONSE_EMAIL');
```

Replace `MONSE_EMAIL` with the email on her Auth account. The update is performed in the dashboard as the project owner; app users cannot change their own role.

## Credential handling

- The project URL and public/publishable client key can be used in a browser app when row-level security is enabled.
- Never add the database password, service-role key, VAPID private key, or push authentication secrets to the GitHub repository or browser code.
- The web client, sign-in flow, shared data loading/saving, invitations, and push sending are separate implementation steps and are not active yet.
