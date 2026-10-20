fn main() {
    println!("cargo:rerun-if-changed=../../../shared/app-config.json");
    println!("cargo:rerun-if-changed=../frontend");
    println!("cargo:rerun-if-changed=../../web");
    println!("cargo:rerun-if-changed=../../../shared");
    println!("cargo:rerun-if-changed=../../../tools/build-windows.py");
    println!("cargo:rerun-if-changed=../../../tools/frontend.py");
    let status = std::process::Command::new("python")
        .arg("../../../tools/build-windows.py")
        .status()
        .expect("Python is required to prepare the Windows frontend");
    assert!(status.success(), "Windows resource preparation failed");
    tauri_build::build();
}
