fn main() {
    println!("cargo:rerun-if-changed=../../../shared/app-config.json");
    tauri_build::build();
}
