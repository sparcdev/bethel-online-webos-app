# Bethel ONLINE — webOS TV App

Native LG webOS TV app for the [Bethel ONLINE](https://www.bethel.online/) VOD
platform. Wraps no webview — it talks directly to the underlying
[Streann](https://www.streann.com/) API and renders a TV-native UI with proper
D-pad navigation, native HLS playback, and Continue Watching.

> **Personal-use only.** This app uses Bethel ONLINE's existing OAuth client
> (the same one publicly visible in their web bundle) to access an account the
> user is already subscribed to. It is not published to the LG Content Store
> and is not affiliated with Bethel Media or Streann.

## Why this exists

Casting from iPhone/Mac to an LG TV (AirPlay) is buggy with bethel.online's
web player. Building a thin native app makes the content play directly on the
TV — no laptop or phone in between, no AirPlay mid-stream cut-outs.

## Features

- **One-time login** — email/password against bethel.online; refresh-token
  rotation keeps the session alive without re-entry.
- **Home screen** — pulled from `tab-layout`; renders all rows the website
  shows (Highlights, Online Gathering Replay, Events, Speakers, …) with
  fast skeleton loading.
- **Spatial D-pad navigation** — custom engine, focuses by bounding-box
  geometry, smooth scroll, focus memory across screens.
- **Series archive ("layout") view** — for series like Sermons, drills into
  the full year-by-year archive (e.g. 18 years for Sermons), matching the
  website's `/en/vods/<series>` page rather than the per-VOD detail.
- **Detail screen with seasons** — season tabs auto-hide if there's only one.
  Episode tiles include date and runtime, sorted newest first.
- **Player** — native HLS in a `<video>` tag, OK pause/play, ←/→ seek 30s,
  centered play indicator while paused, local Continue Watching that
  resumes per-VOD on next launch.
- **Live channels** — surfaced from the home tab-layout, marked with a LIVE
  badge, BACK to exit.
- **Search** — RED button or the search button in the header; queries
  Streann's `content-search` endpoint with debounced input.
- **Exit confirmation** on the home screen.

## Architecture

Vanilla ES2015+ — no framework, no build step. webOS TV's Chromium handles
modules natively.

```
app/
├── appinfo.json              # webOS manifest
├── index.html
├── icons/
├── src/
│   ├── main.js               # Bootstrap + router wiring
│   ├── router.js             # Screen stack with push/pop/navigate
│   ├── api.js                # Streann API client (fetch + Bearer + 401 retry)
│   ├── auth.js               # OAuth password grant + refresh-token rotation
│   ├── nav.js                # Spatial D-pad navigation engine
│   ├── remote.js             # webOS keycodes → semantic events
│   ├── store.js              # Tiny pub-sub state (token, user, lastFocus)
│   ├── config.js             # Streann/Bethel constants
│   ├── screens/              # login, home, detail, player, search
│   └── components/           # tile, row
└── styles/                   # base, login, home, detail, player, search
```

### Key API endpoints (Streann)

| Purpose                      | Endpoint                                                              |
| ---------------------------- | --------------------------------------------------------------------- |
| Token                        | `POST /web/oauth/token`                                               |
| User profile                 | `GET /web/services/user/profile`                                      |
| Home tab structure           | `GET /web/services/v3/user/tab-layout`                                |
| Continue Watching            | `GET /web/services/v3/user/cw/{userId}/ct/vod`                        |
| VOD detail + seasons         | `GET /web/services/v3/user/season/vod-details/{vodId}`                |
| Episodes per season          | `GET /web/services/v3/user/vods/season/{seasonId}/series/{seriesId}/{userId}` |
| Search                       | `POST https://content-search.services.c1.streann.com/v1/search`       |
| HLS playlist (VOD/channel)   | `GET https://cf.streann.tech/loadbalancer/services/v1/{kind}-secure/{id}/playlist.m3u8` |

The loadbalancer with `doNotUseRedirect=true` returns a JSON `{ url }` pointing
to the actual HLS manifest (on `cfvod.streann.tech` / `bethel-aws-1.streann.tech`).

## Requirements

- An LG TV running webOS 5 or newer with Developer Mode enabled
- [webOS TV CLI](https://webostv.developer.lge.com/develop/tools/cli-installation)
  (`@webos-tools/cli`) installed locally
- An active bethel.online subscription
- Node.js 18+ (for the webOS CLI)

## Build & install

```bash
# Configure your TV once
ares-setup-device

# From the project root:
ares-package app -o build
ares-install --device <your-device> build/nl.rubenlievense.bethelonline_2.7.3_all.ipk
ares-launch --device <your-device> nl.rubenlievense.bethelonline
```

## Remote controls

| Key         | Home / Detail / Search | Player          |
| ----------- | ---------------------- | --------------- |
| D-pad       | Navigate tiles / tabs  | Show overlay    |
| OK          | Activate               | Pause / resume  |
| ←  /  →     | Move focus             | Skip ±30s       |
| PLAY/PAUSE  | —                      | Play / pause    |
| REW / FF    | —                      | Skip ±30s       |
| RED         | Open Search (Home)     | —               |
| BLUE        | Sign out (Home)        | —               |
| BACK        | Exit dialog / back     | Save + exit     |

## Known limitations

- **No My List management** — display only.
- **No subtitles UI** — the native `<video>` picks up tracks when present.
- **No parental control / PIN flow.**
- **No payments / TVOD purchase flow.** This app assumes an existing
  subscription.
- **Search results don't include thumbnails** for some content types because
  Streann's `content-search` response omits image URLs in those cases.

## Credits

- **Bethel Media** for the content. Subscribe at [bethel.online](https://www.bethel.online/).
- **Streann Media** for the underlying VOD platform.
- App built with [Claude Code](https://claude.com/claude-code).

## License

Personal-use project. Not licensed for redistribution. If you want to fork it
for your own subscription, go ahead — just don't publish it.
