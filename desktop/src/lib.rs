//! The Mac app: a window around the same client build the website serves (`client/dist`).
//! Everything the app asks of the system goes through the commands registered here; the client's
//! side of them is `client/src/platform/index.js`.

#[cfg(target_os = "macos")]
mod authorize;
mod links;
mod menu;
#[cfg(target_os = "macos")]
mod notifications;
mod queue;
mod save;
mod secrets;
#[cfg(feature = "smoke")]
mod smoke;
mod timer;
mod window;

use tauri::{Manager, RunEvent};

/// The website whose API this app talks to.
pub const APP_URL: &str = match option_env!("FRACTAL_APP_URL") {
    Some(url) => url,
    None => "https://my.fractalgoals.com",
};
/// Compared with the server's `MIN_SUPPORTED_BUILDS`; raised with every release.
pub const BUILD: &str = match option_env!("FRACTAL_BUILD") {
    Some(build) => build,
    None => "1",
};

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(window::remembered()).build())
        .manage(links::Links::default())
        .manage(timer::Timer::default());

    #[cfg(not(feature = "smoke"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        secrets::secret_get,
        secrets::secret_set,
        secrets::secret_delete,
        queue::queue_all,
        queue::queue_put,
        queue::queue_delete,
        queue::queue_clear,
        links::open_external,
        links::take_links,
        save::save_file,
        authorize::authorize,
        timer::set_timer,
        notifications::allow_reminders,
        notifications::set_reminders,
    ]);
    #[cfg(feature = "smoke")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        secrets::secret_get,
        secrets::secret_set,
        secrets::secret_delete,
        queue::queue_all,
        queue::queue_put,
        queue::queue_delete,
        queue::queue_clear,
        links::open_external,
        links::take_links,
        save::save_file,
        authorize::authorize,
        timer::set_timer,
        notifications::allow_reminders,
        notifications::set_reminders,
        smoke::smoke_report,
        smoke::smoke_state,
    ]);

    let app = builder
        .setup(|app| {
            app.manage(queue::Queue::in_dir(app.path().app_data_dir()?.join("unsent")));
            menu::install(app.handle())?;
            window::open(app.handle())?;
            timer::install(app.handle())?;
            notifications::install(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("the app could not start");

    app.run(|app, event| match event {
        RunEvent::Opened { urls } => {
            for url in urls {
                links::open(app, url.as_str());
            }
        }
        // The Dock icon brings back a closed window.
        RunEvent::Reopen { .. } => window::show(app),
        _ => {}
    });
}
