Written with Rust for the playlist/data layer and browser JavaScript for the media APIs.

- Create and delete playlists
- Add YouTube videos with YouTube links
- Add Spotify tracks with Spotify track links
- Save playlists in browser localStorage
- Play YouTube videos in an embedded YouTube player
- Play Spotify tracks in Spotify's official embedded player
- Previous / next
- Shuffle
- YouTube autoplay to the next track when a video ends

This project uses Spotify's official Embed Player, which
has its own controls and browser/Spotify autoplay restrictions. This is because we don't have a backend.

Supported URL formats:

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`
- `https://open.spotify.com/track/TRACK_ID`

Playlist
  ├── name
  └── songs[]
       ├── id
       ├── title
       ├── provider
       └── url

There is no account system or cloud synchronization.
