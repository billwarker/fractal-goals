//! Saving a file where the person chooses.

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// False when they cancelled.
#[tauri::command(async)]
pub fn save_file(app: AppHandle, name: String, content: String) -> Result<bool, String> {
    let Some(chosen) = app.dialog().file().set_file_name(name).blocking_save_file() else {
        return Ok(false);
    };
    let path = chosen.into_path().map_err(|error| error.to_string())?;
    std::fs::write(path, content).map_err(|error| error.to_string())?;
    Ok(true)
}
