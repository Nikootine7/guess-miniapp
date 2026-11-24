# RaPPuzzle Mini App

Persian, RTL daily rap/poetry game for Farcaster Mini Apps.

## MVP scope

- Farcaster Quick Auth identifies players by verified FID.
- Admin FIDs can publish and update daily prompts from an in-app control panel.
- Prompts use a curated list of accepted Persian rhyme endings.
- Each player gets up to three attempts, scoring 50 / 30 / 10 for a match and 0 for a wildcard after the third miss.
- Completing the challenge unlocks the community feed; the database also rejects votes from players who have not completed it.
- Players spend up to 100 social points per day, in 10-point actions from the app.
- The weekly leaderboard sums code and community scores. Top-three awards for completed weeks remain visible in the award history.
- Local preview data is clearly separated from live data; live player state is loaded from Supabase, never local storage.

Persian text is normalized for Unicode composition, Arabic/Persian Yeh and Kaf variants, diacritics, and trailing punctuation. Rhyme validation remains an exact match against each prompt's curated word list. Automatic syllable and meter analysis, NFTs, payments, merchandise, and artist progression are later phases.

## Database status

The initial RapPuzzle migration and three follow-up migrations have been applied to Supabase and are recorded in migration history. They create namespaced `rap_*` tables and functions, leaving the existing `daily_prompts`, `submissions`, `ratings`, and `user_stats` tables untouched. RLS is enabled; browser roles have no direct table or function access. Server routes use the service-role key and enforce Quick Auth.

No live prompt has been seeded yet. Admins can publish one from the app after the production domain, environment values, and admin FID are configured.

## Local preview

Requires Node.js 22.12 or newer. Set the Vercel project root to `rap-puzzle`, then run:

```sh
npm install
npm run dev
```

The local preview uses sample prompts, submissions, and scores stored in this browser. It never writes those sample values to Supabase.

## Server configuration

Set these in the hosting provider. Keep the service-role key server-only and never prefix it with `VITE_`.

- `FARCASTER_APP_DOMAIN`: exact production hostname, without scheme or path.
- `SUPABASE_URL`.
- `SUPABASE_SERVICE_ROLE_KEY`.
- `RAPPUZZLE_ADMIN_FIDS`: comma-separated FIDs allowed to publish prompts.
- `VITE_RAPPUZZLE_LIVE=true`: enable live mode in the client build after the API routes and environment variables are configured.

Open `/api/auth/me` inside the Farcaster Mini App to confirm the signed-in FID. Admin FIDs see a management tab that publishes or updates prompts through `POST /api/admin/prompts`. Example body:

```json
{
  "active_date": "2026-11-25",
  "opening_line": "A prompt line written by the project owner",
  "target_rhyme_word": "نور",
  "accepted_end_words": ["عبور", "حضور", "غرور", "صبور"]
}
```

The route accepts today or future UTC dates, normalizes Persian spellings, includes the target word in the accepted list, and replaces an existing prompt for the same date only before the first attempt.

## Farcaster publishing

The production domain and signed account association are not configured yet. Choose the final domain first, generate its association in the Farcaster Mini App Manifest Tool, and place the resulting values in `docs/manifest.template.json`. The domain in the signature must exactly match the manifest host. The template is intentionally unsigned and must not be published as a production manifest.

The Vite app and API routes are prepared for a Vercel deployment with `rap-puzzle` as the project root. Production publication still needs the chosen domain, environment values, a published daily prompt, and deployment.
