 Mechanicko Android UAT Release

This GitHub release provides a standalone Android APK for user acceptance testing (UAT) of Mechanicko, an app that connects motorists with nearby mechanics for roadside assistance and scheduled vehicle services.

> UAT notice: This build connects to the configured live Supabase project. Use test accounts and non-sensitive information. Do not submit real identity documents, personal details, or payment information.

 Features to test

- Motorist onboarding: Create an account, add a vehicle, and submit service requests. Vehicle plate numbers are validated during entry.
- Emergency assistance: Walk through the emergency request flow and check the request and mechanic-dispatch status updates.
- Mechanic applications: Register as a mechanic and submit the required application details and documents. Mechanic access is subject to application approval.
- Role-based experiences: Explore the separate motorist and mechanic workflows. Administrative features are restricted to authorized admin accounts.
- Theme controls: Switch between light and dark themes in the app.

 Technology

- Mobile app: React Native, Expo, and TypeScript
- Backend: Supabase Authentication, PostgreSQL, Row Level Security, and Storage
- Maps: Leaflet displayed in a React Native WebView
- Builds and updates: Expo Application Services (EAS Build and EAS Update)

 Install on Android

1. Download the `mechanicko-preview.apk` asset attached to this GitHub release.
2. Open the downloaded APK. If Android asks, allow your browser or file manager to install unknown apps.
3. Install the app and launch it.
4. Use a test account when registering or signing in.

 Updates and platform availability

This APK is built for the EAS `preview` channel. Compatible JavaScript and UI updates may be delivered using EAS Update without downloading another APK. Updates that change native code or require a different runtime need a new build.

This release includes an Android APK only; an iOS build is not provided.

## Administrator access

1. Create the administrator account in the Supabase project's Authentication dashboard, or register it through the app first.
2. In the Supabase SQL Editor, promote that account's existing profile to the `admin` role. Replace the example email and verify that exactly one row is updated:

   ```sql
   update public.profiles
   set role = 'admin'
   where id in (
     select id
     from auth.users
     where lower(email) = lower('admin@example.com')
   );
   ```

3. In the Android app, open the customer login screen, choose **Admin access**, and sign in with that account. The app checks the profile role before opening the mobile `/admin` dashboard.

Only a trusted project owner should promote admin accounts in Supabase. Never put the Supabase service-role key in the mobile app or public client configuration.

### Admin user management

The admin dashboard's **Invite**, **Edit**, and **Delete** actions use the `admin-users` Supabase Edge Function. Deploy it from the repository root after signing in to the Supabase CLI and linking the project:

```sh
npx supabase db push
npx supabase functions deploy admin-users
```

Review the pending migration before applying it. It prevents public sign-up metadata from granting an administrator role.

The function validates the caller's Supabase session and confirms the caller still has the `admin` profile role before performing privileged Auth or profile operations. Supabase's hosted Edge Function environment provides the Supabase URL, anon key, and service-role key. Keep the service-role key on the server; never add it to Expo app configuration or client environment variables.

The admin dashboard creates confirmed Auth accounts directly with an initial password, so the user can sign in immediately using the supplied email and password. Share the initial password with the user securely. The password is only sent to the server for account creation and is not stored in the profile.

Accounts created by an admin are assigned the selected role and marked approved immediately. This is separate from public mechanic registration, which still creates a pending mechanic application for review.

Editing changes a user's profile name. Email and role changes are intentionally not offered because they require additional verification and mechanic-application lifecycle handling. Permanent deletion removes the user's Auth account and cascades to the profile. The function refuses to delete the signed-in admin, the last admin, or a mechanic still linked to service requests.

For local Edge Function development, create `supabase/functions/.env` with the local Supabase URL, anon key, and service-role key, then run:

```sh
npx supabase functions serve admin-users --env-file supabase/functions/.env
```

That local secrets file is ignored by Git and must never be committed.
