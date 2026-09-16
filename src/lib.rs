use wasm_bindgen::prelude::*;
use substring::Substring;


#[wasm_bindgen]
pub fn extract_video_id(input: &str) -> String {
	if let Some(idx) = input.find("watch?v=") {
        return input.substring(idx + 8, input.chars().count())
            .split('&').next().unwrap_or("").to_string();
    }
    if let Some(idx) = input.find("youtu.be/") {
        return input.substring(idx + 9, input.chars().count())
            .split('?').next().unwrap_or("").to_string();
    }
    if let Some(idx) = input.find("embed/") {
        return input.substring(idx + 6, input.chars().count())
            .split('?').next().unwrap_or("").to_string();
    }

    String::new()
}

#[wasm_bindgen]
pub fn extract_spotify_id(input: &str) -> String {
	if let Some(idx) = input.find("track/") {
        return input.substring(idx + 6, idx+22)
    }
    String::new()
}

