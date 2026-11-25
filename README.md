# Receipts

## Run the app

### 1. Install the tools

**Windows**
- Install [Node.js](https://nodejs.org) (the LTS version).
- Install [Git](https://git-scm.com/download/win).

**Mac**
- Install [Node.js](https://nodejs.org) (the LTS version).
- Git comes with the Mac. The first time you run `git`, accept the prompt to install the developer tools.

**Phone**
- Install **Expo Go** from the App Store or Play Store.

### 2. Get the code

Open a terminal (PowerShell on Windows, Terminal on Mac) and run:

```
git clone https://github.com/MiloKesteloot/Receipts.git
cd Receipts
npm install
```

### 3. Start it

```
npx expo start
```

Scan the QR code it prints. On iPhone use the Camera app; on Android use Expo Go. Your phone and computer must be on the same Wi-Fi.

On Windows, if a firewall popup asks about Node.js, click **Allow**.

To get new changes later, run `git pull` and `npm install`, then `npx expo start` again.

## The server (Supabase)

The app uses a shared Supabase database. Its connection details are already in `.env`, so you don't need to set anything up to run the app.

To use your own Supabase project instead:

1. Create a project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor**, paste in [`supabase/setup.sql`](supabase/setup.sql) and click **Run**.
3. Put your project's URL (**Project Settings → Data API**) and publishable key (**Project Settings → API Keys**) in `.env`.
4. Restart `npx expo start`.

Never put the secret key or database password in `.env`; it's committed to git.

### Receipt scanning

The `scan-receipt` Edge Function sends receipt images to Azure Document Intelligence and maps the result into the fields used by the app. Set these Supabase Function secrets before deploying it:

- `AZURE_DI_ENDPOINT`: your Azure Document Intelligence endpoint.
- `AZURE_DI_KEY`: your Azure Document Intelligence key.

Deploy the function with the Supabase CLI from the project directory:

```
supabase functions deploy scan-receipt
```

The app checks the image size, retries a failed request once, times out slow scans, and asks for a retake when Azure finds no readable receipt. If the web build is served from a browser origin, set the `APP_ORIGIN` Function secret to that exact origin to tighten CORS. Native requests do not need an origin value.

### Camera

The group receipt flow opens an in-app camera sheet. It includes camera permission handling, a library fallback, a photo review step, and a retake action. `expo-camera` is a native module, so use a development build for device testing after installing dependencies:

```
npx expo run:ios
npx expo run:android
```

Expo Go can still exercise the library fallback. Test the camera on a real phone with long, dim, crumpled, non-US, and library photos before tuning capture quality.

### Sign-in

You need an account to use the app. Every screen except sign-in is hidden until you sign in, and the database only lets signed-in users see groups they belong to.

Set these up in the Supabase dashboard under **Authentication**:

- **Email:** on by default. With **Confirm email** on, new accounts must click the link in their email before they can sign in.
- **URL Configuration → Redirect URLs:** add `receipts://**`, `exp://**` and (for `npx expo start --web`) `http://localhost:8081/**`. This is where Google, Apple and confirmation emails send people back to the app.
- **Google:** Google sign-in is off until you do all of these:
  1. In [Google Cloud](https://console.cloud.google.com/apis/credentials), set up the **OAuth consent screen** (External, with your app name and support email). While it is in "Testing", add each tester's Gmail under **Test users**.
  2. Create an **OAuth client ID** of type **Web application**. Under **Authorized redirect URIs**, add `https://<project-ref>.supabase.co/auth/v1/callback`, the callback URL Supabase shows on its Google provider page.
  3. In Supabase under **Sign In / Providers → Google**, turn it on and paste in that client's ID and secret. The secret only goes here, never in `.env` or the repo.
- **Apple:** turn on Apple. On iPhone the app uses Apple's own sign-in sheet, so add the app's bundle ID to **Client IDs**. Expo Go uses `host.exp.Exponent`. Android and web use Apple's web sign-in, which also needs a Services ID and secret key from the [Apple Developer site](https://developer.apple.com/account/resources/identifiers/list/serviceId).

Google and Apple sign-in redirect back into the app, which works best in a development build (`npx expo run:ios` / `run:android`) rather than Expo Go.

## Tests

```
npm test
```

## Troubleshooting

- **The app looks like the Expo welcome screen:** you opened an old project in Expo Go. Scan the QR code again.
- **Phone can't connect:** check you're on the same Wi-Fi, or run `npx expo start --tunnel`.
- **Something looks stale:** run `npx expo start --clear`.
- **"Google sign-in isn't turned on yet"** in the app, or `Unsupported provider: provider is not enabled` in a browser: Google is off in Supabase. Follow the Google steps under [Sign-in](#sign-in).
- **Google says `redirect_uri_mismatch`:** the Google client's authorized redirect URI must be exactly `https://<project-ref>.supabase.co/auth/v1/callback`.
- **After picking a Google account, the browser lands on another page (like `localhost:3000`) instead of going back to the app:** Supabase didn't accept the app's redirect and fell back to its Site URL. Check that `receipts://**` and `exp://**` are in **Redirect URLs**. In Expo Go this happens even when they are: on Wi-Fi, Expo Go's address uses your computer's IP (`exp://192.168.x.x:8081/…`), and Supabase won't match an IP address against `exp://**`. Start with `npx expo start --tunnel` so the address is a hostname (`exp://….exp.direct/…`), or use a development build, which uses `receipts://`.
