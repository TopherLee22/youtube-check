use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use web_sys::Window;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub provider: String,
    pub url: String,
}

#[wasm_bindgen]
pub fn parse_song_url(url: &str) -> JsValue {
    let result = parse_url(url);
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

fn parse_url(url: &str) -> Option<Song> {
    let original = url.trim();
    let lower = original.to_lowercase();

    if lower.contains("youtube.com/watch") || lower.contains("youtu.be/") || lower.contains("youtube.com/shorts/") {
        let id = youtube_id(original)?;
        return Some(Song {
            id: id.clone(),
            title: format!("YouTube video {}", id),
            provider: "youtube".into(),
            url: original.into(),
        });
    }

    if lower.contains("open.spotify.com/track/") {
        let id = spotify_track_id(original)?;
        return Some(Song {
            id: id.clone(),
            title: format!("Spotify track {}", id),
            provider: "spotify".into(),
            url: original.into(),
        });
    }

    None
}

fn youtube_id(url: &str) -> Option<String> {
    let lower = url.to_lowercase();
    if let Some(pos) = lower.find("youtu.be/") {
        return Some(url[pos + 9..].split(&['?', '&', '#'][..]).next()?.to_string());
    }
    if let Some(pos) = lower.find("youtube.com/shorts/") {
        return Some(url[pos + 19..].split(&['?', '&', '#'][..]).next()?.to_string());
    }
    if let Some(pos) = lower.find("youtube.com/watch") {
        let query = url.get(pos..)?.split_once('?')?.1;
        for pair in query.split('&') {
            let mut it = pair.splitn(2, '=');
            if it.next()? == "v" {
                return Some(it.next()?.to_string());
            }
        }
    }
    None
}

fn spotify_track_id(url: &str) -> Option<String> {
    let marker = "open.spotify.com/track/";
    let lower = url.to_lowercase();
    let pos = lower.find(marker)?;
    Some(url[pos + marker.len()..].split(&['?', '&', '#'][..]).next()?.to_string())
}

#[wasm_bindgen]
pub fn storage_key() -> String {
    "mixed-music-playlists-v1".into()
}

#[wasm_bindgen]
pub fn save_playlists(json: &str) -> bool {
    let window: Window = match web_sys::window() {
        Some(w) => w,
        None => return false,
    };
    let storage = match window.local_storage() {
        Ok(Some(s)) => s,
        _ => return false,
    };
    storage.set_item(&storage_key(), json).is_ok()
}

#[wasm_bindgen]
pub fn load_playlists() -> String {
    let window: Window = match web_sys::window() {
        Some(w) => w,
        None => return "[]".into(),
    };
    let storage = match window.local_storage() {
        Ok(Some(s)) => s,
        _ => return "[]".into(),
    };
    storage.get_item(&storage_key()).ok().flatten().unwrap_or_else(|| "[]".into())
}
