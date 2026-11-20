# Seyami

A photo-first social app MVP built with React, Vite, and Supabase. Accounts, profiles, posts, likes, image uploads, and direct messages are stored in Supabase; the app does not use mock or browser-local persistence.

## Requirements

- Node.js 20.19+ or 22.12+
- A Supabase project

## Setup

1. Install dependencies with `npm install`.
2. In your Supabase project, open **Project Settings → API** and copy the project URL and public anon/publishable key.
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These are browser-visible public configuration values. Never put a Supabase `service_role` key in a `VITE_` variable or commit real credentials.
4. Choose the database script for your project:
   - **Existing Seyami project:** run only `supabase/fix_posts_permissions.sql` in the Supabase **SQL Editor**. This repeatable, transactional migration retains existing rows and objects, and applies the current comments, notifications, post-edit, messaging, RLS, Storage, and Realtime changes.
   - **New project:** run `supabase/schema.sql` in the **SQL Editor** to create the tables, signup profile trigger, policies, Storage buckets, and Realtime setup.
   After an existing-project migration, optionally run `supabase/verify_permissions.sql` for read-only inspection. Do not run `schema.sql` as an additional migration on an existing project.
5. In **Authentication → URL Configuration**, set the Site URL to your app URL. For local development, use `http://localhost:5173`. Add `http://localhost:5173/` to the Redirect URLs allow list. For production, also add the exact production origin with a trailing slash (for example, `https://seyami.example/`). The signup request explicitly redirects confirmation to the current app origin; Supabase will reject it if that URL is not allow-listed.
6. Start the app with `npm run dev`. Restart the dev server after changing `.env`.

Do not treat database changes as applied until the SQL Editor reports a successful run. `verify_permissions.sql` only reports current grants, RLS policies, columns, constraints, indexes, Storage configuration, RPC privileges, and Realtime publication membership; it does not modify the database.

In **Authentication → Sign In / Providers → Email**, keep email provider enabled and turn on email confirmations if you want confirmation required. Keep the confirmation email template's confirmation link as `{{ .ConfirmationURL }}` so Supabase verifies the token before redirecting back to Seyami. Seyami uses the PKCE auth flow: Android callbacks exchange a one-time code with the verifier held by the app instead of accepting access and refresh tokens from the callback URL. A confirmed, signed-in user lands in the app dashboard, while a confirmation that does not create a session returns to the login screen. Until the project is configured, Seyami displays setup instructions rather than pretending that local demo data is being saved.

## Features

- Supabase email/password signup, login, and logout
- User profiles created automatically when accounts sign up
- Profile editing, post editing and deletion, comments, and notifications
- Persistent feed, likes, photo/video posts and stories (up to 50 MB) that expire after 24 hours
- Follow and unfollow people, and view your follower/following lists and counts on your profile
- Reels tab for video posts, username search, and direct messages with live message updates
- Responsive English-language interface

Conversation creation is handled by the `get_or_create_conversation` database function. Row-level security restricts message reads and sends to conversation participants; users may only upload supported photos and videos into their own Storage folders.

## Install Seyami as an app

Seyami is an installable Progressive Web App (PWA). Deploy it to an HTTPS origin to enable installation on phones and desktops. In a supported browser, use the **Install app** button when it appears, or the browser's **Install Seyami** / **Add to Home Screen** menu. On iPhone or iPad, open Seyami in Safari, tap **Share**, then **Add to Home Screen**. The app shell can open offline after it has loaded once, but signing in, loading posts, uploading photos, and sending messages need an internet connection.

An Android wrapper project is also configured with Capacitor (`com.seyami.app`). After changing the app, run `npm run android:sync` and rebuild/reinstall the Android app so the phone receives the updated UI. To create an Android App Bundle for Google Play, install Android Studio and its Android SDK, configure the local Supabase `.env`, and create a release signing key somewhere outside this project, for example with `keytool -genkeypair -v -keystore "$HOME\\seyami-release-key.jks" -alias seyami -keyalg RSA -keysize 2048 -validity 10000`. Back up this key and its passwords securely. Set `SEYAMI_KEYSTORE_PATH`, `SEYAMI_KEYSTORE_PASSWORD`, `SEYAMI_KEY_ALIAS`, and `SEYAMI_KEY_PASSWORD` in your build environment, then run `npm run android:release`. The resulting bundle is generated under `android/app/build/outputs/bundle/release/`. Never commit signing keys or passwords. The application ID is `com.seyami.app` and must remain unique and unchanged after the first Play Store release. Use `npm run android:open` to open the project in Android Studio.

Publishing requires your own verified Google Play Console developer account and completion of Play's store listing, privacy, testing, and release requirements. This code project cannot sign in to your account or publish on your behalf.

For Android email confirmation to reopen the installed app, add `com.seyami.app://login-callback/` to **Authentication → URL Configuration → Redirect URLs** in Supabase. The Android callback uses a custom scheme, so PKCE protects the authorization code from being exchanged by another app; verified HTTPS App Links still require a production web domain and Android asset-link configuration. Browser/PWA users should keep the matching HTTPS/localhost URL allow-listed as described above.

Stories are stored in a private Storage bucket. Story media is downloaded only when opened, using an authenticated request that is checked against the active-story policy; the viewer also clears the media at story expiry. Existing story rows and media objects are retained, and previously stored public story URLs are normalized to their object paths locally.

## Development

- `npm run dev` — start Vite
- `npm run build` — create a production build
- `npm run lint` — run Oxlint

The browser app uses only the Supabase public anon/publishable key. Database access is protected by the row-level security policies in `supabase/schema.sql`.
