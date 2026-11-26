//! Secrets in the macOS Keychain, under the app's own name.

use security_framework::base::Error;
use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};
use tauri::AppHandle;

const NOT_FOUND: i32 = -25300; // errSecItemNotFound

fn missing_is_none<T>(result: Result<T, Error>) -> Result<Option<T>, String> {
    match result {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.code() == NOT_FOUND => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command(async)]
pub fn secret_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    missing_is_none(get_generic_password(&app.config().identifier, &key))?
        .map(|bytes| String::from_utf8(bytes).map_err(|error| error.to_string()))
        .transpose()
}

#[tauri::command(async)]
pub fn secret_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    set_generic_password(&app.config().identifier, &key, value.as_bytes()).map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn secret_delete(app: AppHandle, key: String) -> Result<(), String> {
    missing_is_none(delete_generic_password(&app.config().identifier, &key)).map(drop)
}
