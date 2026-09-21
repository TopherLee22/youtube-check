let wasm = null;
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

// The page remains usable even if the WASM module has not loaded yet.
// Rust/WASM is used when available, with browser APIs as a fallback.
function loadLocalPlaylists() {
  try {
    const raw = localStorage.getItem("mixed-music-playlists-v1");
    const parsed = raw ? JSON.parse(raw) : [];
    playlists = Array.isArray(parsed) ? parsed : [];
  } catch {
    playlists = [];
  }

  if (!playlists.length) playlists = [{ name: "My Playlist", songs: [] }];
  playlists = playlists.map(p => ({
    name: String(p?.name || "Untitled Playlist"),
    songs: Array.isArray(p?.songs) ? p.songs : []
  }));
}

function persist() {
  const json = JSON.stringify(playlists);
  try { localStorage.setItem("mixed-music-playlists-v1", json); } catch {}
  if (wasm?.save_playlists) wasm.save_playlists(json);
}

async function initWasm() {
  try {
    wasm = await import("./pkg/mixed_music_player.js");
    await wasm.default();
    // Migrate/use WASM storage if it contains valid data.
    const stored = wasm.load_playlists?.();
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        playlists = parsed.map(p => ({
          name: String(p?.name || "Untitled Playlist"),
          songs: Array.isArray(p?.songs) ? p.songs : []
        }));
        persist();
      }
    }
  } catch (error) {
    // WASM is an enhancement, not a requirement for the UI to function.
    console.warn("Rust/WASM could not be loaded; using browser fallback.", error);
    wasm = null;
  }
  render();
}

function init() {
  loadLocalPlaylists();
  render();
  initWasm();
}

function currentPlaylistData() {
  if (!playlists[currentPlaylist]) currentPlaylist = 0;
  return playlists[currentPlaylist];
}

function render() {
  if (!playlists.length) playlists = [{ name: "My Playlist", songs: [] }];
  if (currentPlaylist >= playlists.length) currentPlaylist = playlists.length - 1;

  playlistSelect.innerHTML = playlists.map((p, i) =>
    `<option value="${i}">${escapeHtml(p.name)}</option>`
  ).join("");
  playlistSelect.value = String(currentPlaylist);

  const playlist = currentPlaylistData();
  $("playlist-name").textContent = playlist.name;
  $("song-count").textContent = `${playlist.songs.length} song${playlist.songs.length === 1 ? "" : "s"}`;

  songList.innerHTML = playlist.songs.map((song, i) => `
    <li class="${i === currentSong ? "active" : ""}">
      <div class="song-main" data-index="${i}">
        <div class="song-name">${escapeHtml(song.title || `${song.provider} — ${song.id}`)}</div>
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

function parseSongUrl(raw) {
  // Prefer the Rust implementation when available.
  if (wasm?.parse_song_url) {
    try {
      const value = wasm.parse_song_url(raw);
      if (value && typeof value === "object") return value;
    } catch (e) {
      console.warn("Rust URL parser failed; using JS parser.", e);
    }
  }

  let url;
  try { url = new URL(raw.trim()); } catch { return null; }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let id = null;
  let provider = null;

  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
    provider = "youtube";
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (url.pathname.startsWith("/shorts/")) id = url.pathname.split("/")[2];
    provider = "youtube";
  } else if (host === "open.spotify.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "track") {
      id = parts[1];
      provider = "spotify";
    }
  }

  if (!id || !provider) return null;
  return { id, provider, url: raw.trim(), title: `${provider === "youtube" ? "YouTube" : "Spotify"} — ${id}` };
}

function addSong() {
  const raw = songUrl.value.trim();
  if (!raw) return setStatus("Paste a song link first.");

  const song = parseSongUrl(raw);
  if (!song) {
    setStatus("Unsupported link. Use a YouTube video/Short or Spotify track link.");
    return;
  }

  const playlist = currentPlaylistData();
  playlist.songs.push(song);
  persist();
  songUrl.value = "";
  currentSong = -1;
  shuffledOrder = [];
  render();
  setStatus("Song added to “" + playlist.name + "”.");

  // Do not force autoplay here; browser autoplay policies can block it.
  // The user can click the newly added song to start it.
  playSong(playlist.songs.length - 1);
}

function removeSong(index) {
  const playlist = currentPlaylistData();
  playlist.songs.splice(index, 1);

  if (currentSong === index) {
    stopPlayer();
    currentSong = -1;
    playerContainer.innerHTML = `<div class="empty-player">Select another song to play.</div>`;
  } else if (currentSong > index) currentSong--;

  shuffledOrder = [];
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
    playerContainer.innerHTML = `
      <iframe id="spotify-frame"
        src="https://open.spotify.com/embed/track/${encodeURIComponent(song.id)}?utm_source=generator"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="eager" title="Spotify player"></iframe>`;
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
  } else createYTPlayer(videoId);
}

function createYTPlayer(videoId) {
  if (!window.YT?.Player) return;
  ytPlayer = new YT.Player("yt-player", {
    width: "100%", height: "100%", videoId,
    playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
    events: { onStateChange: event => {
      if (event.data === YT.PlayerState.ENDED) nextSong();
    }}
  });
}

function nextSong() {
  const songs = currentPlaylistData().songs;
  if (!songs.length) return;
  if (shuffleEnabled) {
    if (!shuffledOrder.length || shuffledOrder.length !== songs.length) rebuildShuffle();
    const position = shuffledOrder.indexOf(currentSong);
    playSong(shuffledOrder[(position + 1) % shuffledOrder.length]);
  } else playSong((currentSong + 1 + songs.length) % songs.length);
}

function previousSong() {
  const songs = currentPlaylistData().songs;
  if (songs.length) playSong((currentSong - 1 + songs.length) % songs.length);
}

function togglePlay() {
  if (!ytPlayer) {
    setStatus("Spotify playback is controlled by the Spotify player above.");
    return;
  }
  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
  else ytPlayer.playVideo();
}

function rebuildShuffle() {
  const n = currentPlaylistData().songs.length;
  shuffledOrder = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
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
  const name = window.prompt("Playlist name:", `Playlist ${playlists.length + 1}`);
  if (!name || !name.trim()) return;

  playlists.push({ name: name.trim(), songs: [] });
  currentPlaylist = playlists.length - 1;
  currentSong = -1;
  shuffledOrder = [];
  persist();
  render();
  setStatus(`Created “${name.trim()}”.`);
});

$("delete-playlist").addEventListener("click", () => {
  if (playlists.length === 1) return setStatus("You must keep at least one playlist.");
  if (!confirm(`Delete "${currentPlaylistData().name}"?`)) return;
  playlists.splice(currentPlaylist, 1);
  currentPlaylist = Math.min(currentPlaylist, playlists.length - 1);
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
