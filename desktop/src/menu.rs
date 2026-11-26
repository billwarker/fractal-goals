//! The menu bar. Choices that belong to the client are passed to it as `menu` events, by id.

use tauri::menu::{AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::{links, window, APP_URL};

/// Id, label and shortcut of each page in a fractal, in the order of the app's own navigation.
const PAGES: [(&str, &str, &str); 5] = [
    ("page:goals", "Goals", "Cmd+1"),
    ("page:programs", "Programs", "Cmd+2"),
    ("page:sessions", "Sessions", "Cmd+3"),
    ("page:notes", "Notes", "Cmd+4"),
    ("page:analytics", "Analytics", "Cmd+5"),
];

fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let item = |id: &str, label: &str, keys: &str| MenuItemBuilder::with_id(id, label).accelerator(keys).build(app);
    let about = AboutMetadataBuilder::new().website(Some("https://fractalgoals.com")).build();
    let app_menu = SubmenuBuilder::new(app, "Fractal Goals")
        .about(Some(about))
        .separator()
        .item(&item("settings", "Settings…", "Cmd+,")?)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let file = SubmenuBuilder::new(app, "File")
        .item(&item("new-session", "New Session", "Cmd+N")?)
        .separator()
        .close_window()
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit").undo().redo().separator().cut().copy().paste().select_all().build()?;
    let mut go = SubmenuBuilder::new(app, "Go")
        .item(&item("back", "Back", "Cmd+[")?)
        .item(&item("forward", "Forward", "Cmd+]")?)
        .separator()
        .item(&item("fractals", "All Fractals", "Cmd+0")?);
    for (id, label, keys) in PAGES {
        go = go.item(&item(id, label, keys)?);
    }
    let go = go.build()?;
    let view =
        SubmenuBuilder::new(app, "View").item(&item("reload", "Reload", "Cmd+R")?).separator().fullscreen().build()?;
    let windows = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .item(&item("show-window", "Fractal Goals", "Cmd+Shift+0")?)
        .build()?;
    let help =
        SubmenuBuilder::new(app, "Help").text("privacy", "Privacy Policy").text("terms", "Terms of Service").build()?;
    MenuBuilder::new(app).items(&[&app_menu, &file, &edit, &go, &view, &windows, &help]).build()
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    app.set_menu(build(app)?)?;
    app.on_menu_event(|app, event| choose(app, event.id().as_ref()));
    Ok(())
}

pub fn choose(app: &AppHandle, id: &str) {
    match id {
        "privacy" | "terms" => {
            links::open_in_browser(app, &format!("{APP_URL}/{id}"));
        }
        "reload" => {
            if let Some(window) = app.get_webview_window(window::MAIN) {
                let _ = window.reload();
            }
        }
        "show-window" => window::show(app),
        "settings" | "new-session" | "fractals" | "back" | "forward" => pass_on(app, id),
        _ if id.starts_with("page:") => pass_on(app, id),
        _ => {}
    }
}

fn pass_on(app: &AppHandle, id: &str) {
    window::show(app);
    let _ = app.emit("menu", id);
}
