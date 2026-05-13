# OYDisplay GA4 Dashboard (Cloudflare Pages)

This project is ready for Cloudflare Pages deployment.

## Project Structure

- Frontend: `index.html`, `app.js`, `styles.css`
- Cloudflare Pages Functions:
  - `functions/api/health.js`
  - `functions/api/ga4/discover.js`
  - `functions/api/ga4/dashboard.js`
  - `functions/api/ga4/enable-services.js` (optional helper)

## Deploy to Cloudflare Pages

1. Push this folder to a GitHub repository.
2. In Cloudflare Dashboard:
   - Go to `Workers & Pages`
   - Create a new `Pages` project
   - Connect your GitHub repository
3. Build settings:
   - Framework preset: `None`
   - Build command: empty
   - Build output directory: `.`
4. Deploy.

## Required Environment Variables (Secrets)

In `Pages Project -> Settings -> Environment variables`, add:

- `GA4_CLIENT_EMAIL`
  - Example: `codex-581@quick-flame-492901-s4.iam.gserviceaccount.com`
- `GA4_PRIVATE_KEY`
  - Use the exact `private_key` value from your service account JSON
  - Keep multiline format with:
    - `-----BEGIN PRIVATE KEY-----`
    - `-----END PRIVATE KEY-----`
- `GA4_PROJECT_ID` (optional, used by `enable-services`)
  - Example: `quick-flame-492901-s4`

Set these for both `Production` and `Preview` environments.

## Verify After Deploy

1. Open `/api/health`
   - Should return `ok: true` and show `hasClientEmail` / `hasPrivateKey` as `true`
2. Open the dashboard page
3. Click `Auto Detect Property`
4. Click `Connect GA4`

## Default GA4 Property

The frontend currently defaults to:

- `484489968` (`www.Oydisplay.com - GA4`)

You can still type another property ID in the UI.

## Local Debug (Optional)

You can still run the old local Node API (`server.js`) for debugging:

```powershell
cd C:\Users\Administrator\Documents\Codex\2026-05-13\new-chat
node server.js
```

Then open `http://localhost:8787`.