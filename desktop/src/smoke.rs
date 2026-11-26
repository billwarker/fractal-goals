//! Smoke builds only (`--features smoke`): a script from `smoke/run.mjs` drives the real app and
//! reports back here, since nothing can automate this app's web view from outside.

use std::{env, fs};

use tauri::{AppHandle, State};

use crate::timer::Timer;

/// Appended to the shell's script when the runner set one.
pub fn script() -> Option<String> {
    let script = fs::read_to_string(env::var("FRACTAL_SMOKE_SCRIPT").ok()?).ok()?;
    Some(script.replace("__SMOKE__", &env::var("FRACTAL_SMOKE").ok()?))
}

#[tauri::command(async)]
pub fn smoke_report(app: AppHandle, report: serde_json::Value) {
    if let Ok(path) = env::var("FRACTAL_SMOKE_REPORT") {
        let _ = fs::write(path, report.to_string());
    }
    app.exit(0);
}

/// What the page can't see for itself.
#[tauri::command(async)]
pub fn smoke_state(timer: State<Timer>) -> serde_json::Value {
    serde_json::json!({ "timer": timer.title_now() })
}
