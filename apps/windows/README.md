# Windows 桌面版

Tauri 2 + 系统 WebView2，学习界面继续采用普通 HTML/CSS/JavaScript。无前端框架、常驻服务或主程序 Node.js 运行时。Android 与 Windows 共享 `shared/` 中的解析、词库、录音匹配、星标规则、主题和语速偏好。

## 开发

需要 Python 3.10+、Node.js 22+、pnpm、Rust stable MSVC、Visual Studio C++ 桌面工具链和 WebView2。已有 Rust 时直接使用；首次安装若希望放在 E 盘，应先设置 `CARGO_HOME=E:\Rust\cargo`、`RUSTUP_HOME=E:\Rust\rustup`，再运行官方 rustup 安装器，将 Cargo bin 加入用户 PATH，重开终端。不要把本机路径写进项目文件。

```powershell
pnpm --dir apps/windows install --frozen-lockfile
pnpm --dir apps/windows dev
```

开发模式与正式包使用同一本地资源协议。Tauri 监听 `frontend/`、`../web/` 与 `shared/`；修改后由 Rust 构建钩子重新准备资源并重启窗口，偏好仍保存在原 WebView2 profile。无需额外开发服务器或手动复制生成目录。

构建配置中的 `0.0.0` 仅为占位符；以上入口先执行 `tools/build-windows.py`，从 `shared/app-config.json` 生成忽略的 `tauri.generated.json`，再传给 Tauri。构建钩子也会准备资源，确保源码修改进入原生包。版本配置修改后重新运行开发入口；不要绕过入口直接运行 `cargo run` 或裸 `tauri build`。

本机 Cargo / Rustup 位于 E 盘；本项目忽略的 `src-tauri/.cargo/config.toml` 将 target-dir 指向 `E:\Rust\targets\GermanWords`。其他电脑可使用默认 target 目录或自己的本机配置，无需照搬路径。

## 目录边界

- `../web/`：Windows 与浏览器共用的一套桌面界面、学习逻辑与备份校验。
- `frontend/`：`desktop.js` 处理内置资源、原生更新与反馈；`update-dialog.html` 只提供 Windows 更新对话框，由构建工具装入共用页面。
- `src-tauri/`：本地窗口、官方更新插件、安装器及受限 IPC。原生层不解析 Excel、不实现学习规则。
- `../../shared/`：共享规则和资源，不依赖 Tauri。
- `../../output/windows/web/`：生成的自包含前端，不提交；同样供浏览器回归使用。

WebView2 数据目录由固定应用 identifier `cn.study.germanwords` 管理，更新安装文件不清理用户数据。前端不加载远程页面，不开放通用 shell 或文件系统命令；更新请求由原生插件执行，本地页面 CSP 不允许外部网络或内联脚本。

内置词库自动载入，在「词库与设置 → 课程」选择德语（1）或德语（2），记住课程选择。自定义词表 / 音频沿用会话导入方式，新一批导入替换上一批，重开应用后需要重新选择；切换课程不会清除或隐藏导入内容。两门课程分别保存内置词表星标，导入词表的星标全局有效。德语（2）按所提供的 9 份词表收录，暂不含 E7/E8、例句与录音，可自行导入录音。备份包含课程选择；旧备份缺少课程时恢复为德语（1）。

## 安装与更新

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = '<仓库外的 Tauri 私钥文件路径>'
pnpm --dir apps/windows build
```

生成按用户安装的 NSIS `*-setup.exe` 和对应 `.sig`，默认在 Cargo target 的 `release/bundle/nsis/` 下。无需管理员权限安装应用本体；缺少 WebView2 时，安装器会引导安装运行时，需要联网及系统允许。完全离线、运行时缺失的电脑需事先部署 WebView2；不声称当前小安装包解决该场景。

更新来源与另一端统一维护，启动时尝试检查，距上次成功检查不足 24 小时则跳过，也可从「词库与设置」手动检查。下载前询问，官方插件验签后启动安装器并关闭当前应用。断网与更新失败不影响离线学习。安装器采用常规 Windows 进度界面。

在「词库与设置 → 接收更新」选择「正式版」或「测试版（含正式版）」，切换后立即检查；各通道分别计算 24 小时间隔。新安装默认跟随安装包通道，之后记住用户选择，覆盖升级不重置。切回正式版不会降级较高的测试版；下载和安装期间暂不允许切换。

安装包的 Tauri 更新签名不能替代 Windows Authenticode 代码签名；当前开发包尚未配置正式代码签名，不承诺消除 SmartScreen 提示。

签名备份、完整发布顺序和旧客户端迁移要求统一见 [维护与发布要求](../../docs/requirements.md)。

## 从旧静态版迁移

旧浏览器与桌面 WebView2 的存储相互独立，不能自动继承星标。资源准备会生成 `output/windows/GermanWords-Legacy-Migration.zip`：解压到**原来 HTML 所在文件夹**覆盖应用文件，保留文件夹路径、`De_words_helper.html` 文件名以及原来的浏览器。然后打开原地址，点「导出星标与设置」；在桌面版导入该 JSON。导入会询问并替换已有星标与主题、语速；无效文件不会覆盖状态。备份不含词库/音频。

旧 PowerShell 更新器已从新桌面源码移除。旧云盘 ZIP 和更新入口保留，原型不会自动变为桌面安装：首次桌面迁移应手动运行新安装包。

## 验证与适配

```powershell
pnpm --dir tests test
pnpm --dir tests test:browser
```

`tests/desktop.cjs` 针对真实 Tauri WebView2 执行，不用普通浏览器模拟桌面宿主。测试时才给子进程设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223` 和隔离的 `WEBVIEW2_USER_DATA_FOLDER`，再运行 `node tests/desktop.cjs`；正常使用不要设置调试端口。测试下载和截图不参与应用打包。

首轮目标 Windows 10/11 x64；ARM64 可以用 Tauri 的 `--target aarch64-pc-windows-msvc` 构建，需安装相应 Rust target 和 Visual Studio ARM64 工具链，发布前另做真机验证。不能把架构可编译等同于已适配测试。

双端共用根目录的正式/测试更新入口，包放在版本子目录。先用 `--prepare-only` 校验，再去掉参数执行发布；完整步骤见 [更新维护](../../docs/updates.md)。词库与设置中的“意见反馈”仅在点击提交时发送内容和基本设备/应用信息；失败保留文字。
