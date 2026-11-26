//! The app's one window. Closing it only hides it, so a running session stays in the menu bar.

use std::process::Command;

use serde_json::json;
use tauri::{webview::NewWindowResponse, AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_window_state::StateFlags;

use crate::{links, APP_URL, BUILD};

pub const MAIN: &str = "main";

/// Frames the client embeds (the same list as the CSP's frame-src).
const FRAME_HOSTS: [&str; 7] = [
    "www.youtube-nocookie.com",
    "www.youtube.com",
    "www.instagram.com",
    "drive.google.com",
    "docs.google.com",
    "accounts.google.com",
    "www.dropbox.com",
];

/// Size and place, but never visibility: the app always opens with its window.
pub fn remembered() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN
}

/// The name shown in Settings → Account, as the owner named this Mac.
fn device_name() -> String {
    Command::new("/usr/sbin/scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Mac".into())
}

/// What the client finds before any of its own scripts run.
fn shell_script() -> String {
    let shell = json!({
        "platform": "macos",
        "build": BUILD.parse::<u32>().unwrap_or(1),
        "apiUrl": format!("{APP_URL}/api"),
        "appUrl": APP_URL,
        "deviceName": device_name(),
    });
    let script = include_str!("shell.js").replace("__SHELL__", &shell.to_string());
    #[cfg(feature = "smoke")]
    let script = script + &crate::smoke::script().unwrap_or_default();
    script
}

/// Pages that may load here: the app's own, and the players and previews it embeds. Nothing but the
/// app's own pages can reach the commands.
pub fn may_load(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "about" => true,
        "https" => url.host_str().is_some_and(|host| FRAME_HOSTS.contains(&host)),
        _ => false,
    }
}

pub fn open(app: &AppHandle) -> tauri::Result<()> {
    let opener = app.clone();
    let window = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::default())
        .title("Fractal Goals")
        .inner_size(1280.0, 860.0)
        .min_inner_size(480.0, 560.0)
        .zoom_hotkeys_enabled(true)
        .initialization_script(shell_script())
        .on_navigation(may_load)
        .on_new_window(move |url, _| {
            links::open_in_browser(&opener, url.as_str());
            NewWindowResponse::Deny
        })
        .build()?;
    let hidden = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = hidden.hide();
        }
    });
    Ok(())
}

pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_app_and_its_embeds_load() {
        let allowed = |url: &str| may_load(&Url::parse(url).unwrap());
        assert!(allowed("tauri://localhost/root/goals"));
        assert!(allowed("https://www.youtube-nocookie.com/embed/x"));
        assert!(!allowed("https://my.fractalgoals.com/"));
        assert!(!allowed("https://www.youtube.com.evil.test/"));
        assert!(!allowed("tauri://elsewhere/"));
        assert!(!allowed("file:///etc/passwd"));
        assert!(!allowed("http://www.youtube.com/"));
    }
}
