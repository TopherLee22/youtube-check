# Rust Mix Player

A GitHub Pages-friendly music playlist application written with Rust/WASM for the
playlist/data layer and browser JavaScript for the media APIs.

## What it does

- Create and delete playlists
- Add YouTube videos with YouTube links
- Add Spotify tracks with Spotify track links
- Save playlists in browser localStorage
- Play YouTube videos in an embedded YouTube player
- Play Spotify tracks in Spotify's official embedded player
- Previous / next
- Shuffle
- YouTube autoplay to the next track when a video ends
- Responsive layout

## Important limitation: Spotify

A completely static GitHub Pages site cannot safely implement Spotify's full Web
Playback SDK authentication because Spotify access tokens should not be exposed
as permanent secrets in frontend source code.

This project therefore uses Spotify's official Embed Player. The Spotify iframe
has its own controls and browser/Spotify autoplay restrictions.

If you need **true unified controls, automatic cross-provider playback, and
gapless-ish behavior**, you will need a backend/authentication service for
Spotify and should use the Spotify Web Playback SDK for eligible Spotify users.
You would also need to account for Spotify's current developer/platform terms.

## Build locally

Install Rust and wasm-pack:

```bash
cargo install wasm-pack
```

Then:

```bash
wasm-pack build --target web
python -m http.server 8080
```

Open:

```text
http://localhost:8080
```

Do not open `index.html` directly with `file://`; browsers block some module/WASM
operations from local files.

## GitHub Pages

This repository includes `.github/workflows/pages.yml`.

1. Push the project to GitHub.
2. In GitHub, open **Settings → Pages**.
3. Set the source to **GitHub Actions**.
4. Push to `main`.
5. The workflow builds the Rust/WASM package and publishes the site.

The workflow runs `wasm-pack build --target web`, so the generated `pkg/` directory
does not need to be committed.

## URL formats

Supported:

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`
- `https://open.spotify.com/track/TRACK_ID`

## Data model

Everything in this version is local to the browser:

```text
Playlist
  ├── name
  └── songs[]
       ├── id
       ├── title
       ├── provider
       └── url
```

There is no account system or cloud synchronization.

## Recommended next step for a production version

If you want users to log in and have playlists available on multiple devices,
add a backend (for example, Rust/Axum + PostgreSQL) and authentication. Keep
Spotify OAuth tokens server-side where possible, and add YouTube/Spotify API
integration only where the respective platform policies permit it.
