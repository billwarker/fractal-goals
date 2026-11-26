//! Links into the app (`fractalgoals://`, notifications, the menu bar) and out of it.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, State, Url};
use tauri_plugin_opener::OpenerExt;

use crate::{window, APP_URL};

/// Links the page hasn't taken yet.
#[derive(Default)]
pub struct Links(Mutex<Vec<String>>);

pub fn open(app: &AppHandle, link: &str) {
    use tauri::Manager;
    app.state::<Links>().0.lock().unwrap().push(link.to_string());
    window::show(app);
    let _ = app.emit("links-waiting", ());
}

/// Open one of the app's own paths.
pub fn open_path(app: &AppHandle, path: &str) {
    open(app, &format!("{APP_URL}{path}"));
}

#[tauri::command]
pub fn take_links(links: State<Links>) -> Vec<String> {
    std::mem::take(&mut *links.0.lock().unwrap())
}

/// Only what a browser or mail app should open: never a file or another app's scheme.
fn may_open(url: &str) -> bool {
    Url::parse(url).is_ok_and(|url| matches!(url.scheme(), "https" | "http" | "mailto"))
}

pub fn open_in_browser(app: &AppHandle, url: &str) -> bool {
    may_open(url) && app.opener().open_url(url, None::<&str>).is_ok()
}

#[tauri::command(async)]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if open_in_browser(&app, &url) {
        Ok(())
    } else {
        Err("That link could not be opened.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_web_and_mail_links_leave_the_app() {
        assert!(may_open("https://example.com/a"));
        assert!(may_open("mailto:support@fractalgoals.com"));
        assert!(!may_open("file:///Applications/Calculator.app"));
        assert!(!may_open("ssh://host"));
        assert!(!may_open("not a url"));
    }
}
