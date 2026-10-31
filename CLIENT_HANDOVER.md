# Mechanic Ko Client Handover Guide

This guide covers transferring the Mechanic Ko source code, backend, build pipeline, and operational access to the client. The goal is for the client to become the owner of the accounts and credentials, not just receive a copy of the APK.

## 1. Before the handover

- Agree on the handover date, the client's owner email address, and who will be responsible for ongoing maintenance.
- Have the client create or identify their own GitHub, Expo, and Supabase accounts. Enable multi-factor authentication (MFA) and set up recovery methods before transferring ownership.
- Make a handover inventory of the current production and preview environments, including who owns each account, project, domain, and billing relationship. Do not put passwords, API keys, recovery codes, or tokens in this document.
- Export a database backup using Supabase's supported backup method and store it in a client-controlled, access-restricted location. Confirm that the backup can be restored before making database changes.
- Confirm which APK/build is the approved release and how testers or users currently receive it.

## 2. Transfer source-code ownership

1. Transfer the GitHub repository to the client's GitHub organization/account, or add the client as an organization owner and repository administrator.
2. Verify that the client can clone the repository, see its history, manage collaborators, and access any required GitHub Actions or release assets.
3. Review repository collaborators, deploy keys, GitHub tokens, webhooks, and automation secrets. Remove access that is no longer needed and rotate credentials that may have been shared.
4. Ensure `.env` and other local secret files are not tracked. This repository ignores `.env`; `.env.example` is a template, not a credential store. Never commit a real `.env`.

## 3. Transfer Supabase ownership and verify the backend

The app uses Supabase for authentication, PostgreSQL, Row Level Security (RLS), Storage, and Realtime.

1. Transfer the Supabase organization/project to the client's account using Supabase's supported ownership-transfer process. If a new project is required, plan a data migration rather than changing the app URL without a backend migration.
2. Give the client owner-level access and verify that billing, MFA, recovery, backups, Auth settings, Storage, database settings, and logs are under client control.
3. Review every deployed database migration against the live database before applying anything. This repository contains 31 SQL files under `supabase/migrations`, but does not currently include `supabase/config.toml`. A previous check of `supabase_migrations.schema_migrations` returned that the relation did not exist. This means the migration history cannot currently be used to establish which files ran. It does **not** prove that the migration changes are absent.
4. Compare the live schema, policies, triggers, functions, Storage buckets/policies, and Realtime publication with the migration files and the expected app behavior. Record a verified baseline, then test any missing migration on a staging/backup copy first. Do not run every SQL file blindly against the live project.
5. Test sign-up/login, role access, vehicle and booking flows, chat image upload/read access, mechanic availability updates, and cancellation rules after verification.
6. After the client controls the project, rotate database passwords, personal access tokens, and any privileged secrets that were shared. Review Auth redirect URLs, OAuth provider credentials, SMTP settings, and Storage access.

### Supabase key handling

- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or a publishable key) are app-client configuration and are visible in a compiled mobile app. The anon/publishable key is not a substitute for RLS; verify policies protect every table and Storage object.
- Never put a Supabase `service_role`/secret key, database password, or other privileged credential in the app, an `EXPO_PUBLIC_*` variable, source control, or a client-shared document.
- The preview build profile currently defines Supabase client configuration in `eas.json`. Before client production releases, move environment-specific values into the client's EAS environment configuration and ensure the production profile points to the intended Supabase project.
- `.env.example` shows the variable names expected for local development. The client should obtain the correct values from the Supabase project they own and enter them in their private local `.env` or EAS environment. Do not send `.env` over chat/email or ask the client to commit it.

## 4. Transfer Expo/EAS ownership and release access

1. Transfer the EAS project to the client account/team if supported, or create a client-owned EAS project and deliberately update the project ID in `app.config.js`. Confirm the client's EAS account can run a test build before removing the previous owner's access.
2. The current app config references an EAS project ID in `app.config.js`; that ID belongs to an EAS project and does not by itself transfer ownership.
3. Confirm that the client controls EAS build/update access, environment variables, build credentials, and the `preview`/production channels. Remove old EAS tokens and revoke access for former maintainers after a successful client build.
4. Preserve the Android application ID `com.mechaniko.app` and the existing Android signing identity for updates to an already distributed app. Do not regenerate or replace signing credentials without a planned migration; a different signing key can prevent existing users from installing updates.
5. The current EAS config has a preview APK profile and a production Android App Bundle profile. The configured runtime version follows the app version. Test the client's build and update flow with a small internal release before publishing to users.
6. OTA updates can deliver compatible JavaScript and bundled assets. Changes to the native app icon, native splash/build configuration, native modules, or runtime require a new native build.

## 5. Production readiness and release checks

Before a client production release:

- Confirm the target Supabase project and EAS environment are production-owned and correctly configured.
- Verify RLS and Storage policies, Auth redirect URLs, database triggers/functions, and Realtime settings in the target project.
- Apply only reviewed, pending database migrations after a verified backup and staging test.
- Run `npm ci`, `npx expo lint`, and `npx tsc --noEmit`.
- Build and install a client-owned Android artifact; exercise motorist, mechanic, and administrator flows with test accounts.
- Review app permissions, privacy disclosures, data-retention requirements, support contacts, and account deletion process.
- Store release artifacts and build records in client-controlled storage. Do not distribute test credentials with the APK.

## 6. Local developer setup for the client

From the repository root, with Node.js installed:

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env` locally with the client's Supabase URL and anon/publishable key. Keep the file private and untracked. Then verify the project:

```powershell
npx expo lint
npx tsc --noEmit
npx expo start
```

EAS commands should be run after signing in with the client's Expo account and confirming the project/channel:

```powershell
npx eas-cli build --profile preview --platform android
npx eas-cli update --channel preview --message "Describe the tested update"
```

Use the production profile/channel only after production configuration and release approval are confirmed.

## 7. Final access cleanup and acceptance

- Ask the client to confirm they can access the repository, Supabase project, EAS project, build credentials, backups, and release artifacts.
- Have the client create a successful build and confirm they can review or publish an approved update.
- Rotate or revoke the previous team's personal access tokens, shared passwords, EAS tokens, deploy keys, and any credentials the client has replaced.
- Remove former team members from GitHub, Supabase, and Expo unless the client explicitly retains them as maintainers.
- Record the accepted handover date, repository commit/tag, approved APK/build ID, database backup reference, verified migration baseline, and remaining known issues in client-controlled records. Do not record secrets.

## Ownership checklist

| Area | Client owner confirmed | Access tested | Notes/reference |
|---|---|---|---|
| GitHub repository and release assets | [ ] | [ ] | |
| Supabase organization/project and billing | [ ] | [ ] | |
| Supabase backup and restore procedure | [ ] | [ ] | |
| Database schema/policies/migration baseline | [ ] | [ ] | |
| Expo/EAS project and billing | [ ] | [ ] | |
| EAS environments and update channels | [ ] | [ ] | |
| Android signing credentials and package ID | [ ] | [ ] | |
| Production APK/AAB and release records | [ ] | [ ] | |
| Old accounts/tokens reviewed and revoked | [ ] | [ ] | |
