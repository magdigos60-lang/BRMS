# Barangay Resident Management System

## Run locally
1. `npm install`
2. Copy `.env.example` to `.env` and fill it in
3. `npm run dev` -> http://localhost:3000

## One-time setup for push notifications
1. Supabase > SQL Editor: run `supabase/device_tokens.sql`
2. Firebase console (console.firebase.google.com): create a project, add an Android app
   with package name `ph.gov.barangay.portal`, download `google-services.json`
3. Firebase > Project settings > Service accounts > Generate new private key.
   Paste that JSON (single line) into Render env var `FIREBASE_SERVICE_ACCOUNT`
4. GitHub repo > Settings > Secrets and variables > Actions > New secret
   `GOOGLE_SERVICES_JSON` = base64 of google-services.json
   (Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json"))`)

## Build the APK
1. Set `server.url` in `android-app/capacitor.config.json` to your Render HTTPS URL
2. Push to GitHub > Actions > "Build Android APK" > Run workflow
3. Download `barangay-portal-apk` from the run's Artifacts
