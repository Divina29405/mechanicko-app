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
