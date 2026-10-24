# Athera Talks

**T.A.Talk** — Private messages and voice calls.

Live site: [https://taha080.github.io/athera-talks/](https://taha080.github.io/athera-talks/)

Athera Talks (T.A.Talk) is a browser app for private messages and voice calls. You sign in, find a person by their exact username, and talk one to one or in a group. A voice button in a direct chat starts a WebRTC call. Each profile holds a username, an avatar, and a favourite anime. Created by Taha Ahsan.

If the Supabase settings are missing, the app opens a setup screen instead of crashing. **Preview the app** walks through the interface with sample data stored in this browser.

## Features

### Accounts

- Email sign-up and sign-in. The session stays after a refresh.
- Sign-up asks for a username of 3–20 letters, numbers, or underscores, and checks that it is free.
- Passwords are 6 to 72 characters.
- Continue with Google when `VITE_SUPABASE_GOOGLE_ENABLED` is turned on. Until then the button stays disabled, with a short note.
- Forgot-password email, then a page to choose a new password.
- Sign out from the side navigation on a wide screen, and from Settings → Privacy on any screen.

### Chat

- A conversation list with timestamps, unread counts, and delivery and read ticks.
- Filters for all chats and unread chats. Up to three chats can be pinned. Chats can be muted or archived.
- Text, emoji, images, short videos, and voice notes. Images can be pasted. Videos upload in chunks.
- Replies, reactions, copy, edit, delete for everyone, and hide for yourself.
- Search inside a conversation. Links in a message stay tappable.
- A typing indicator, a message chime, and optional desktop alerts.
- Call history in the thread: completed, missed, declined, or cancelled.

### Message requests

Search matches one username exactly (a leading `@` is ignored). A direct chat, a message, or a call starts only after the other person accepts the request. Incoming requests appear under Requests, with a count on the badge.

### Groups

Create a group from people you already chat with. Admins can rename the group, set a photo, add or remove members, and change roles. Any member can leave. Admins can delete the group.

### Voice calls

Start a call, accept or decline an incoming call, mute, switch the speaker, and hang up. A timer runs once the peers connect. The screen shows Calling, Ringing, Connecting, the timer, or a failure reason. A blocked microphone is reported there. Both people need Athera Talks open. In the browser preview, the call screen works and the microphone stays off.

### Premium

Premium is a time window stored on the profile (`premium_from` through `premium_until`). While it is active, the name shows a verified tick, GIF avatars keep animating, and messages use the premium bubble. After the window ends, a GIF avatar stops animating. Settings has no switch for it. An operator grants or revokes it in the database with `grant_premium` and `revoke_premium`.

The creator account is a separate flag. It shows the creator badge, can read the Reports list in Settings, and can still see last seen and read receipts when another person has hidden them. Animated GIF avatars are limited to Premium and the creator. Everyone else can upload PNG, JPEG, or WebP.

### Themes

Sixteen themes, in Classic, Anime, and Soft & Pretty groups. The signed-in default is Midnight. Soft themes also apply a matching wallpaper. Settings includes pattern wallpapers and a photo wallpaper. The choice is saved on the profile, so it follows the account. Before sign-in, the last theme is kept in this browser under `tatalk:theme`. Colours and patterns in the theme set are original.

### Privacy and safety

- Last seen and read receipts can be turned off. Someone is shown as online when they were here in the last 45 seconds.
- Block stops messages and calls in both directions. Settings lists blocked people so you can unblock them.
- Report reasons are Spam, Harassment, Impersonation, and Other.
- A profile opens for someone who already shares a direct chat or a group with you.

A privacy policy ships at `public/privacy.html`.

## How it works

The interface is a React 19 single-page app, built with Vite 6 and styled with Tailwind CSS 4. React Router 7 handles the pages. Lucide supplies the icons.

| Path | Page |
| --- | --- |
| `/login`, `/signup`, `/forgot-password` | Email and Google auth |
| `/reset-password` | Choose a new password after the email link |
| `/` | Chat list, or the welcome pane |
| `/c/:conversationId` | An open chat |
| `/?requests=1` | Message requests |
| `/settings`, `/settings/appearance`, `/settings/privacy` | Profile, themes, and privacy |
| `/settings/reports` | Reports, for the creator account |
| `/profile` | Redirects to Settings |
| `/communities`, `/communities/:communityId` | Communities: channels, events, voice rooms, members and moderation |

Supabase provides four pieces:

- **Auth.** Email and password, optional Google OAuth, and PKCE sessions that persist in the browser.
- **Database.** Postgres tables for profiles, conversations, members, messages, reactions, receipts, hides, contact requests, call signals, call history, blocks, reports, and chat preferences. Row Level Security is enabled on those tables. You read and update your own profile. Chats and messages are limited to members, and a direct chat also requires an accepted contact request. Search and chat headers go through database functions that return a username, avatar, favourite anime, and request state.
- **Storage.** Public buckets `avatars` and `group-photos`. Private buckets `voice-messages`, `chat-images`, `chat-videos`, and `wallpapers`, with policies so chat members can read the files for their conversations. Chat videos use resumable uploads (`tus-js-client`). Rough size caps in the schema are 30 MB for avatars and chat images, 50 MB for chat videos, 8 MB for voice notes, and 3 MB for wallpaper photos.
- **Realtime.** The browser listens for inserts and updates on messages, receipts, reactions, contact requests, call signals, and call history. Typing is a broadcast on a channel named `room:<conversation id>`, not a table row.

A voice call does not use a media server in this repo. Each browser opens a WebRTC peer connection. The offer, answer, and network candidates are rows in `call_signals`. Realtime delivers inserts on `call-signals:<user id>`. The database rejects a signal unless the two people are accepted contacts in that chat.

Before a live call, the browser asks the `turn-credentials` Edge Function for ICE servers. The function checks the caller’s session, reads the secret `METERED_API_KEY`, and returns `{ iceServers }`. Keep `METERED_API_KEY` as an Edge Function secret so the client bundle never contains it. If that request fails, the app uses its built-in relay fallback. About eight seconds into a failed connect, the caller retries through the relay and the screen says it is retrying. If the call is still down after 25 seconds, it stops and asks you to check the network. **Details** on the call screen lists the connection path that was gathered. Set `VITE_TURN_URLS` to `none` to stay on STUN only. Set `VITE_TURN_URLS` with `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL`, or with `VITE_TURN_SECRET`, to point a build at another relay.

The client is created only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` look real. Placeholder values from `.env.example` count as unset. A configured build stays in live mode. With no configuration, **Preview the app** stores sample conversations in `localStorage` on this browser.

## Set up

1. Create a project at [supabase.com](https://supabase.com) and wait until the database is ready.
2. Open **SQL Editor → New query**, paste `supabase/schema.sql`, and run it. The script is safe to run again: policies are replaced, and existing tables stay.
3. Run these two files next, in order. They add call history, which `schema.sql` does not create:
   - `supabase/migrations/20261020220000_call_history.sql`
   - `supabase/migrations/20261020230000_call_log_once.sql`
4. The `supabase/migrations/` folder is the ordered history of the same schema. On a project that already has an older copy, apply the later files in filename order instead of starting over.

### Communities

Communities are a separate, multi-user layer beside chats and groups: create a community (public, private or invite-only), discover and join it, run text and announcement channels with pinned messages and polls, schedule events with RSVPs, open group voice rooms, and moderate with owner/admin/member/pending roles, reports, mutes, bans, slow mode and a basic word filter. Member profiles reuse the existing profile model (username, avatar, favourite anime).

To share communities across devices, apply `supabase/migrations/20261024120000_communities.sql` in Supabase (SQL Editor, or `supabase db push`). Until that migration is applied, the Communities page shows a banner and runs in local demo mode in that browser only, so the rest of the site is never broken by a missing table. Group voice rooms reuse the existing WebRTC TURN/ICE helpers over a Supabase Realtime broadcast channel; they are a small-room peer mesh, not a media server.

### Email auth

1. Open **Authentication → Providers → Email** and leave it enabled.
2. Leave **Confirm email** off. New accounts are confirmed on the server, and sign-up opens the app.
3. Under **Authentication → URL configuration**, set **Site URL** to `http://localhost:5173` while you develop.
4. Add redirect URLs:
   - `http://localhost:5173/**`
   - `https://taha080.github.io/athera-talks/**` for the published site
   - `https://<github-username>.github.io/athera-talks/**` if you publish your own fork
   - Your Vercel origin with `/**`, if you use Vercel

The reset-password link returns to `/reset-password`. The wildcards above cover that path.

### Google sign-in

The **Continue with Google** button stays disabled until you opt in, so a project without Google configured does not fail on click. The browser preview always enables a pretend Google button.

1. In Google Cloud Console, create an OAuth client for a web application. Add `http://localhost:5173` and your production origin as JavaScript origins. Set the authorized redirect URI to the Supabase Auth callback shown under **Authentication → Providers → Google**.
2. In Supabase, turn the Google provider on and paste the client ID and client secret there.
3. In `.env`, set `VITE_SUPABASE_GOOGLE_ENABLED` to `true`.
4. Restart `npm run dev`.

For GitHub Pages, add a repository secret with the same name, `VITE_SUPABASE_GOOGLE_ENABLED`, set to `true`. Leave the variable unset or `false` and the live button stays disabled.

### Environment variables

Copy the example file and set the variables below. Keep `.env` out of git. Put the anon key in `VITE_SUPABASE_ANON_KEY` and leave the service-role key on the server. Row Level Security is what keeps rows private.

```bash
cp .env.example .env
```

| Variable | Role |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL from Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Anon public key from the same page |
| `VITE_SUPABASE_GOOGLE_ENABLED` | `true` after the Google provider is enabled |
| `VITE_BASE_PATH` | `/athera-talks/` on GitHub Pages. Leave unset locally and on Vercel |
| `VITE_TURN_URLS` | Optional relay URLs, or `none` for STUN only |
| `VITE_TURN_USERNAME` | Optional relay username |
| `VITE_TURN_CREDENTIAL` | Optional relay credential |
| `VITE_TURN_SECRET` | Optional secret used to build a short-lived relay credential |

`METERED_API_KEY` belongs in Supabase **Edge Functions → Secrets**, or in `supabase secrets set`. Leave it out of `.env`.

### Voice relay function

The source is `supabase/functions/turn-credentials/index.ts`. Deploy it as `turn-credentials` with JWT verification on. Then store `METERED_API_KEY`. Until that secret exists, a signed-in call receives an error from the function and uses the built-in relay fallback.

## Run locally

Use Node.js 22, the version CI installs.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint |
| `npm run build` | Typecheck, production build, and a `404.html` copy for GitHub Pages |
| `npm run preview` | Serve the production build |

## Usage

**Live site or a configured local app**

1. Open the site and create an account, or sign in. Use Google only after that provider is enabled.
2. Search an exact username and send a contact request.
3. When the request is accepted, open the chat. Send text, a photo, a video, or a voice note. Reply, react, or edit from the message menu.
4. Press the phone button for a voice call. The other person accepts or declines.
5. Use the plus menu for a new group. Use Settings for your username, avatar, favourite anime, theme, wallpaper, last seen, receipts, alerts, and blocked people.

**Browser preview**

With no `.env`, or with the placeholder values still in place, the first screen explains how to connect Supabase. **Preview the app** keeps sample conversations in this browser. You can sign up with a new username, use the pretend Google button, and reset the sample chats from Settings. **Preview call** on the chat list opens the incoming-call screen. Sign out and refresh, and the preview session is still there. Nothing in preview mode is stored on a server.

## Project structure

```text
src/
  components/     shared UI (sidebar, thread, composer, call screen, settings pieces)
  context/        session, chat, voice-call state, and theme
  demo/           in-browser preview used when Supabase is not configured
  lib/            helpers (auth, themes, WebRTC, formatting) and unit tests
  pages/          auth, home, settings, reset password, and the 404 page
  services/       live Supabase queries and call signaling
  assets/         images used by the interface
public/           icons, web app manifest, and the privacy policy
supabase/
  schema.sql      full script for a new project
  migrations/     ordered SQL changes
  functions/turn-credentials/   Edge Function that returns ICE servers
.github/workflows/  CI, and the GitHub Pages deploy
scripts/copy-404.mjs
```

The site includes a web app manifest, so a browser can offer to install it.

## Tests

Unit tests live next to the code in `src/**/*.test.ts` and run in Node with Vitest:

```bash
npm test
```

They cover auth rules, themes, premium windows, chat list order, message formatting, WebRTC helpers, the preview backend, and related pure functions. The suite runs in Node.

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request, on Node.js 22: `npm ci`, `npm run lint`, `npm test`, and `npm run build`. The CI build does not receive Supabase secrets, so the production build must succeed in setup mode.

## Deploy

### GitHub Pages

`.github/workflows/deploy.yml` builds with `VITE_BASE_PATH` set to `/athera-talks/` and publishes the `dist` folder. The build copies `index.html` to `404.html` so routes such as `/c/...` still open the app. The manifest `start_url` and `scope` are `.`, so they resolve from the manifest URL to `https://taha080.github.io/athera-talks/`. The app does not register a service worker.

1. The repository name for this site is `athera-talks`. A different name needs a matching `VITE_BASE_PATH`.
2. Under **Settings → Secrets and variables → Actions**, add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SUPABASE_GOOGLE_ENABLED`. Optional relay overrides use `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`, and `VITE_TURN_SECRET`.
3. Under **Settings → Pages → Build and deployment**, set the source to **GitHub Actions**.
4. A push to `main` runs **Deploy to GitHub Pages**.
5. Add the Pages origin to the Supabase redirect allow list, as in the email section above.

When the URL and anon key secrets are set, the published site opens real sign-in. If those secrets are missing, the Pages build still succeeds and the site opens the setup screen.

### Vercel

1. Import the GitHub repo and choose the Vite preset.
2. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SUPABASE_GOOGLE_ENABLED`. Leave `VITE_BASE_PATH` unset so the site is served from `/`.
3. Deploy. `vercel.json` rewrites every path to `index.html`.
4. Add the Vercel origin to the Supabase redirect allow list.

## Screenshots

![Sign in](docs/screenshots/sign-in.png)

![Chat list](docs/screenshots/chat-list.png)

![Chat on a phone](docs/screenshots/chat-mobile.png)

![Incoming call](docs/screenshots/incoming-call.png)

![Profile](docs/screenshots/profile.png)

## License

This repository does not include a `LICENSE` file, and `package.json` does not declare one. Until a license is added, all rights are reserved. Packages installed from npm keep the licenses recorded in `package-lock.json`.
