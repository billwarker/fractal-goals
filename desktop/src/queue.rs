//! Changes not yet sent to the server: one file per change, per account. Each command returns only
//! once the disk holds the change, because the client then tells the person it is saved.

use std::fs::{self, File};
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::State;

pub struct Queue {
    dir: PathBuf,
    // One command at a time: two writes of a change must not interleave.
    lock: Mutex<()>,
}

impl Queue {
    pub fn in_dir(dir: PathBuf) -> Self {
        Self { dir, lock: Mutex::new(()) }
    }

    // Hex, so no id can name a file outside its folder.
    fn account(&self, user_id: &str) -> PathBuf {
        self.dir.join(hex::encode(user_id))
    }

    fn file(&self, user_id: &str, op_id: &str) -> PathBuf {
        self.account(user_id).join(format!("{}.json", hex::encode(op_id)))
    }

    pub fn all(&self, user_id: &str) -> io::Result<Vec<String>> {
        let _held = self.lock.lock().unwrap();
        let entries = match fs::read_dir(self.account(user_id)) {
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            entries => entries?,
        };
        let mut changes = Vec::new();
        for entry in entries {
            let path = entry?.path();
            if path.extension().is_none_or(|extension| extension != "json") {
                continue;
            }
            let bytes = fs::read(&path)?;
            match String::from_utf8(bytes) {
                Ok(text) if serde_json::from_str::<serde_json::Value>(&text).is_ok() => changes.push(text),
                // Kept for support, but one damaged file mustn't hide every other change.
                _ => fs::rename(&path, path.with_extension("unreadable"))?,
            }
        }
        Ok(changes)
    }

    pub fn put(&self, user_id: &str, op_id: &str, value: &str) -> io::Result<()> {
        let _held = self.lock.lock().unwrap();
        let account = self.account(user_id);
        if !account.exists() {
            fs::create_dir_all(&account)?;
            sync_dir(&self.dir)?;
        }
        let target = self.file(user_id, op_id);
        // Written beside and renamed over, so a crash leaves the old change or the new one.
        let partial = target.with_extension("partial");
        let mut file = File::create(&partial)?;
        file.write_all(value.as_bytes())?;
        file.sync_all()?;
        fs::rename(&partial, &target)?;
        sync_dir(&account)
    }

    pub fn delete(&self, user_id: &str, op_id: &str) -> io::Result<()> {
        let _held = self.lock.lock().unwrap();
        match fs::remove_file(self.file(user_id, op_id)) {
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
            Ok(()) => sync_dir(&self.account(user_id)),
        }
    }

    pub fn clear(&self, user_id: &str) -> io::Result<()> {
        let _held = self.lock.lock().unwrap();
        match fs::remove_dir_all(self.account(user_id)) {
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            result => result,
        }
    }
}

fn sync_dir(dir: &Path) -> io::Result<()> {
    File::open(dir)?.sync_all()
}

fn told<T>(result: io::Result<T>) -> Result<T, String> {
    result.map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn queue_all(queue: State<Queue>, user_id: String) -> Result<Vec<String>, String> {
    told(queue.all(&user_id))
}

#[tauri::command(async)]
pub fn queue_put(queue: State<Queue>, user_id: String, op_id: String, value: String) -> Result<(), String> {
    told(queue.put(&user_id, &op_id, &value))
}

#[tauri::command(async)]
pub fn queue_delete(queue: State<Queue>, user_id: String, op_id: String) -> Result<(), String> {
    told(queue.delete(&user_id, &op_id))
}

#[tauri::command(async)]
pub fn queue_clear(queue: State<Queue>, user_id: String) -> Result<(), String> {
    told(queue.clear(&user_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn changes_outlive_the_app_and_accounts_stay_apart() {
        let dir = tempfile::tempdir().unwrap();
        let queue = Queue::in_dir(dir.path().join("unsent"));
        assert!(queue.all("me").unwrap().is_empty());
        queue.put("me", "a", r#"{"name":"Café"}"#).unwrap();
        queue.put("me", "a", r#"{"name":"Renamed"}"#).unwrap();
        queue.put("me", "b", "{}").unwrap();
        queue.delete("me", "b").unwrap();
        queue.delete("me", "never there").unwrap();

        let reopened = Queue::in_dir(dir.path().join("unsent"));
        assert_eq!(reopened.all("me").unwrap(), [r#"{"name":"Renamed"}"#]);
        assert!(reopened.all("someone else").unwrap().is_empty());
        reopened.clear("me").unwrap();
        reopened.clear("me").unwrap();
        assert!(reopened.all("me").unwrap().is_empty());
    }

    #[test]
    fn ids_cannot_escape_their_folder() {
        let dir = tempfile::tempdir().unwrap();
        let queue = Queue::in_dir(dir.path().join("unsent"));
        queue.put("../../me", "../../../a", "{}").unwrap();
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
        assert_eq!(queue.all("../../me").unwrap(), ["{}"]);
    }

    #[test]
    fn a_crash_or_damage_never_hides_the_other_changes() {
        let dir = tempfile::tempdir().unwrap();
        let queue = Queue::in_dir(dir.path().to_path_buf());
        queue.put("me", "good", "{}").unwrap();
        fs::write(queue.file("me", "half").with_extension("partial"), "{").unwrap();
        fs::write(queue.file("me", "bad"), "{").unwrap();
        assert_eq!(queue.all("me").unwrap(), ["{}"]);
        assert!(queue.file("me", "bad").with_extension("unreadable").exists());
    }
}
