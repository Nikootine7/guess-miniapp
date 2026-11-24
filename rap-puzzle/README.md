# RaPPuzzle Mini App

A Persian, RTL Farcaster Mini App prototype for the daily rap/poetry puzzle described in the project handoff.

## Current state

- The app shell, daily challenge, attempt scoring, voting feed, and weekly leaderboard are implemented as a local preview.
- The preview stores progress in this browser only. It does not authenticate a FID, persist official scores, or submit real votes.
- The Farcaster SDK bootstrap is included. A server must verify Quick Auth tokens before any live write.
- A Supabase schema migration and server API scaffold are included for the next phase. They are not deployed or applied.
- No wallet payment or NFT mint is triggered by this prototype.
- The current quality gate checks the final word against a prompt's accepted rhyme list. Persian rhythm and syllable analysis are not implemented yet.

## Run locally

Requires Node.js 22.12 or newer.

1. Enter the rap-puzzle folder. For Vercel, set the project Root Directory to rap-puzzle.
2. Run npm install.
3. Run npm run dev.

The preview banner stays visible unless live mode is explicitly enabled after the backend is configured.

## Live configuration

Configure these server-side environment variables in the hosting provider:

- FARCASTER_APP_DOMAIN: the exact host domain, without scheme or path.
- SUPABASE_URL.
- SUPABASE_SERVICE_ROLE_KEY: keep this server-only; never expose it through a VITE_ variable.

Set VITE_RAPPUZZLE_LIVE=true only after the migration is applied, a daily prompt exists, the API is deployed, and Quick Auth verification works. The browser sends authenticated requests through sdk.quickAuth.fetch; the server verifies each bearer token and gets the FID from the verified token.

Before publishing, use the Farcaster Manifest Tool for the final domain and place its signed accountAssociation values in the manifest. The template in docs/manifest.template.json is deliberately unsigned and is not a production manifest. A hosted manifest is also an option.

## Scoring and product phases

The local preview uses the agreed 50 / 30 / 10 / 0 scoring sequence. A successful rhyme unlocks voting; three failed attempts add the last entry to the feed as a Wildcard. The weekly leaderboard shows sample data until live endpoints are configured.

The initial release has no pay-to-submit step. NFT badges, the marketplace, merchandise, artist progression, and music rights belong to later product phases and need their own rules before implementation.

## Database migration

The SQL file in supabase/migrations defines the RapPuzzle data and server-side scoring functions using the `rap_*` namespace. This keeps the restored project’s existing `daily_prompts`, `submissions`, `ratings`, and `user_stats` tables untouched. The migration has not been applied. Review it before deployment. All user writes must go through authenticated server endpoints; browser clients do not receive the service-role key.

