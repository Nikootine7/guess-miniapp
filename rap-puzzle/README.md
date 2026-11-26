# RaPPuzzle Mini App

Persian RTL daily rap and poetry game for Farcaster Mini Apps.

## MVP behavior

- Farcaster Quick Auth identifies players by verified FID.
- Admin FIDs can publish and update daily prompts from the in-app control panel.
- Prompts use a curated list of accepted Persian rhyme endings.
- Each player gets up to three attempts, scoring 50 / 30 / 10 for a match and 0 for a wildcard after the third miss.
- Completing the challenge unlocks the community feed; the database also rejects votes from players who have not completed it.
- Players spend up to 100 social points per day, in 10-point actions from the app.
- The weekly leaderboard sums code and community scores. Top-three awards for completed weeks remain visible in the award history.
- Local preview data is clearly separated from live data; live player state is loaded from Supabase, never local storage.

Persian text is normalized for Unicode composition, Arabic/Persian Yeh and Kaf variants, diacritics, and trailing punctuation. Rhyme validation remains an exact match against each prompt's curated word list. Automatic syllable and meter analysis, NFTs, payments, merchandise, and artist progression are later phases.

## Production architecture

- The Vite app is deployed as a static Site.
- The rappuzzle-api Supabase Edge Function serves live API requests and validates Farcaster Quick Auth.
- Supabase Edge Function runtime secrets supply SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; they are never included in the browser bundle.
- The client build uses VITE_RAPPUZZLE_LIVE=true and VITE_RAPPUZZLE_API_BASE=https://puzuebidtblapncbacie.supabase.co/functions/v1/rappuzzle-api.

The database migrations create namespaced rap_* tables and functions, leaving the existing daily_prompts, submissions, ratings, and user_stats tables untouched. RLS is enabled; browser roles have no direct table or function access. The five migrations have already been applied.

## Local preview

Requires Node.js 22.12 or newer. Run npm ci, then npm run dev.

The local preview uses sample prompts, submissions, and scores stored in this browser. It never writes those sample values to Supabase.

## Farcaster publication

The production Site is https://rappuzzle.faithfulfolio64.chatgpt.site. The app manifest must be served at /.well-known/farcaster.json and include a signed accountAssociation generated for that exact hostname. The account owner's FID must also be configured as the prompt administrator in the Edge Function.

The unsigned template is at docs/manifest.template.json. Do not deploy it as a production manifest. Once the association is signed, place the complete JSON at public/.well-known/farcaster.json and rebuild.
