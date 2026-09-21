let wasm;
let playlists = [];
let currentPlaylist = 0;
let currentSong = -1;
let shuffledOrder = [];
let shuffleEnabled = false;
let ytPlayer = null;

const $ = id => document.getElementById(id);

const playlistSelect = $("playlist-select");
const songUrl = $("song-url");
const songList = $("song-list");
const playerContainer = $("player-container");

async function init() {
  // wasm-bindgen output is produced by wasm-pack build --target web.
  wasm = await import("./pkg/mixed_music_player.js");
  await wasm.default("./pkg/mixed_music_player_bg.wasm");

  try {
    playlists = JSON.parse(wasm.load_playlists());
  } catch {
    playlists = [];
  }

  if (!Array.isArray(playlists) || playlists.length === 0) {
    playlists = [{ name: "My Playlist", songs: [] }];
  }

  render();
}

function persist() {
  wasm.save_playlists(JSON.stringify(playlists));
}

function currentPlaylistData() {
  return playlists[currentPlaylist];
}

function render() {
  playlistSelect.innerHTML = playlists.map((p, i) =>
    `<option value="${i}" ${i === currentPlaylist ? "selected" : ""}>${escapeHtml(p.name)}</option>`
  ).join("");

  const playlist = currentPlaylistData();
  $("playlist-name").textContent = playlist.name;
  $("song-count").textContent = `${playlist.songs.length} song${playlist.songs.length === 1 ? "" : "s"}`;

  songList.innerHTML = playlist.songs.map((song, i) => `
    <li class="${i === currentSong ? "active" : ""}">
      <div class="song-main" data-index="${i}">
        <div class="song-name">${escapeHtml(song.title)}</div>
        <div class="song-meta">${song.provider === "youtube" ? "YouTube" : "Spotify"}</div>
      </div>
      <button class="remove" data-remove="${i}" title="Remove">✕</button>
    </li>
  `).join("");

  document.querySelectorAll(".song-main").forEach(el => {
    el.addEventListener("click", () => playSong(Number(el.dataset.index)));
  });
  document.querySelectorAll(".remove").forEach(el => {
    el.addEventListener("click", () => removeSong(Number(el.dataset.remove)));
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function addSong() {
  const raw = songUrl.value.trim();
  if (!raw) return setStatus("Paste a song link first.");

  const parsed = wasm.parse_song_url(raw);
  if (!parsed || parsed === null) return setStatus("That does not look like a supported YouTube or Spotify track URL.");

  const song = Object.fromEntries(Object.entries(parsed));
  const playlist = currentPlaylistData();

  // Use the URL-derived ID as the stable ID.
  song.title = song.provider === "youtube" ? `YouTube — ${song.id}` : `Spotify — ${song.id}`;

  playlist.songs.push(song);
  persist();
  songUrl.value = "";
  render();
  setStatus("Song added.");

  if (currentSong === -1) playSong(playlist.songs.length - 1);
}

function removeSong(index) {
  const playlist = currentPlaylistData();
  playlist.songs.splice(index, 1);

  if (currentSong === index) {
    stopPlayer();
    currentSong = -1;
    playerContainer.innerHTML = `<div class="empty-player">Select another song to play.</div>`;
  } else if (currentSong > index) {
    currentSong--;
  }

  persist();
  render();
}

function playSong(index) {
  const songs = currentPlaylistData().songs;
  if (!songs[index]) return;

  currentSong = index;
  render();
  const song = songs[index];

  $("now-title").textContent = song.title;
  $("now-provider").textContent = song.provider === "youtube" ? "YouTube" : "Spotify";

  stopPlayer();

  if (song.provider === "youtube") {
    playerContainer.innerHTML = `<div id="yt-player"></div>`;
    loadYouTube(song.id);
  } else {
    // Spotify's official embed supports track playback in an iframe.
    // Autoplay may require user interaction depending on browser/Spotify policy.
    playerContainer.innerHTML = `
      <iframe
        id="spotify-frame"
        src="https://open.spotify.com/embed/track/${encodeURIComponent(song.id)}?utm_source=generator"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="eager"
        title="Spotify player">
      </iframe>`;
  }
}

function stopPlayer() {
  if (ytPlayer && typeof ytPlayer.destroy === "function") {
    try { ytPlayer.destroy(); } catch {}
  }
  ytPlayer = null;
}

function loadYouTube(videoId) {
  if (!window.YT) {
    const existing = document.getElementById("youtube-api");
    if (!existing) {
      const script = document.createElement("script");
      script.id = "youtube-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
    window.onYouTubeIframeAPIReady = () => createYTPlayer(videoId);
  } else {
    createYTPlayer(videoId);
  }
}

function createYTPlayer(videoId) {
  ytPlayer = new YT.Player("yt-player", {
    width: "100%",
    height: "100%",
    videoId,
    playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
    events: {
      onStateChange: event => {
        if (event.data === YT.PlayerState.ENDED) nextSong();
      }
    }
  });
}

function nextSong() {
  const songs = currentPlaylistData().songs;
  if (!songs.length) return;

  if (shuffleEnabled) {
    if (!shuffledOrder.length || shuffledOrder.length !== songs.length) rebuildShuffle();
    const position = shuffledOrder.indexOf(currentSong);
    const nextPosition = (position + 1) % shuffledOrder.length;
    playSong(shuffledOrder[nextPosition]);
    return;
  }

  playSong((currentSong + 1 + songs.length) % songs.length);
}

function previousSong() {
  const songs = currentPlaylistData().songs;
  if (!songs.length) return;
  playSong((currentSong - 1 + songs.length) % songs.length);
}

function togglePlay() {
  if (!ytPlayer) {
    setStatus("For Spotify, use the controls in the Spotify player.");
    return;
  }
  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
  else ytPlayer.playVideo();
}

function rebuildShuffle() {
  const n = currentPlaylistData().songs.length;
  shuffledOrder = Array.from({length: n}, (_, i) => i);

  for (let i = shuffledOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledOrder[i], shuffledOrder[j]] = [shuffledOrder[j], shuffledOrder[i]];
  }

  if (currentSong >= 0) {
    const p = shuffledOrder.indexOf(currentSong);
    [shuffledOrder[0], shuffledOrder[p]] = [shuffledOrder[p], shuffledOrder[0]];
  }
}

function setStatus(message) {
  $("status").textContent = message;
  clearTimeout(setStatus.timer);
  setStatus.timer = setTimeout(() => $("status").textContent = "", 3500);
}

$("add-song").addEventListener("click", addSong);
songUrl.addEventListener("keydown", e => { if (e.key === "Enter") addSong(); });

playlistSelect.addEventListener("change", e => {
  currentPlaylist = Number(e.target.value);
  currentSong = -1;
  shuffledOrder = [];
  stopPlayer();
  playerContainer.innerHTML = `<div class="empty-player">Select a song to play.</div>`;
  $("now-title").textContent = "Nothing playing";
  $("now-provider").textContent = "";
  render();
});

$("new-playlist").addEventListener("click", () => {
  const name = prompt("Playlist name:", `Playlist ${playlists.length + 1}`);
  if (!name?.trim()) return;
  playlists.push({ name: name.trim(), songs: [] });
  currentPlaylist = playlists.length - 1;
  currentSong = -1;
  persist();
  render();
});

$("delete-playlist").addEventListener("click", () => {
  if (playlists.length === 1) return setStatus("You must keep at least one playlist.");
  if (!confirm(`Delete "${currentPlaylistData().name}"?`)) return;

  playlists.splice(currentPlaylist, 1);
  currentPlaylist = Math.max(0, currentPlaylist - 1);
  currentSong = -1;
  stopPlayer();
  persist();
  render();
  playerContainer.innerHTML = `<div class="empty-player">Select a song to play.</div>`;
});

$("next").addEventListener("click", nextSong);
$("prev").addEventListener("click", previousSong);
$("play").addEventListener("click", togglePlay);
$("shuffle").addEventListener("click", () => {
  shuffleEnabled = !shuffleEnabled;
  if (shuffleEnabled) rebuildShuffle();
  $("shuffle").style.opacity = shuffleEnabled ? "1" : ".55";
  setStatus(shuffleEnabled ? "Shuffle enabled." : "Shuffle disabled.");
});

init();
