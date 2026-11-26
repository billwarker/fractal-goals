fn main() {
    println!("cargo:rerun-if-env-changed=FRACTAL_APP_URL");
    println!("cargo:rerun-if-env-changed=FRACTAL_BUILD");
    tauri_build::build()
}
