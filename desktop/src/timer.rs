//! The running session, in the menu bar.

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Manager, State, Wry};

use crate::{links, window};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    title: String,
    path: String,
    elapsed_seconds: u64,
    running: bool,
}

struct Shown {
    session: Session,
    set_at: u64,
}

#[derive(Default)]
pub struct Timer {
    shown: Mutex<Option<Shown>>,
    tray: Mutex<Option<(TrayIcon, MenuItem<Wry>)>>,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |since| since.as_secs())
}

fn clock(seconds: u64) -> String {
    let (hours, minutes, seconds) = (seconds / 3600, seconds / 60 % 60, seconds % 60);
    if hours > 0 {
        format!("{hours}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes}:{seconds:02}")
    }
}

impl Shown {
    // By the clock on the wall: a session keeps running while the Mac sleeps.
    fn title(&self, at: u64) -> String {
        let since = if self.session.running { at.saturating_sub(self.set_at) } else { 0 };
        let time = clock(self.session.elapsed_seconds + since);
        if self.session.running {
            time
        } else {
            format!("❙❙ {time}")
        }
    }
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let session = MenuItemBuilder::with_id("open-session", "No session in progress").enabled(false).build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&session)
        .separator()
        .text("open-app", "Open Fractal Goals")
        .separator()
        .text("quit", "Quit Fractal Goals")
        .build()?;
    let tray = TrayIconBuilder::with_id("timer")
        .icon(Image::from_bytes(include_bytes!("../icons/menu-bar.png"))?)
        .icon_as_template(true)
        .tooltip("Fractal Goals")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open-session" => {
                let path = app.state::<Timer>().shown.lock().unwrap().as_ref().map(|shown| shown.session.path.clone());
                match path {
                    Some(path) => links::open_path(app, &path),
                    None => window::show(app),
                }
            }
            "open-app" => window::show(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    *app.state::<Timer>().tray.lock().unwrap() = Some((tray, session));

    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        let timer = app.state::<Timer>();
        let title =
            timer.shown.lock().unwrap().as_ref().filter(|shown| shown.session.running).map(|shown| shown.title(now()));
        let tray = timer.tray.lock().unwrap().clone();
        if let (Some(title), Some((tray, _))) = (title, tray) {
            let _ = tray.set_title(Some(title));
        }
    });
    Ok(())
}

/// Show a session in the menu bar, or none.
#[tauri::command(async)]
pub fn set_timer(timer: State<Timer>, session: Option<Session>) -> Result<(), String> {
    let shown = session.map(|session| Shown { session, set_at: now() });
    let title = shown.as_ref().map(|shown| shown.title(now()));
    let label =
        shown.as_ref().map_or("No session in progress".into(), |shown| format!("Open “{}”", shown.session.title));
    let enabled = shown.is_some();
    *timer.shown.lock().unwrap() = shown;
    let Some((tray, item)) = timer.tray.lock().unwrap().clone() else { return Ok(()) };
    let told = |error: tauri::Error| error.to_string();
    tray.set_title(title).map_err(told)?;
    item.set_text(label).map_err(told)?;
    item.set_enabled(enabled).map_err(told)
}

#[cfg(feature = "smoke")]
impl Timer {
    pub fn title_now(&self) -> Option<String> {
        self.shown.lock().unwrap().as_ref().map(|shown| shown.title(now()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shown(running: bool) -> Shown {
        let session = Session { title: "Legs".into(), path: "/r/session/s".into(), elapsed_seconds: 3590, running };
        Shown { session, set_at: 1000 }
    }

    #[test]
    fn counts_only_while_running() {
        assert_eq!(shown(true).title(1000), "59:50");
        assert_eq!(shown(true).title(1015), "1:00:05");
        assert_eq!(shown(false).title(1015), "❙❙ 59:50");
        // A clock set back never counts below where it began.
        assert_eq!(shown(true).title(900), "59:50");
    }
}
