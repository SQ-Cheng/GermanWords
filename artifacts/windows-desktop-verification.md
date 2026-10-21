# Windows 桌面迁移验证

日期：2026-10-17。基线 `codex/update-source-investigation` / `e44bdeb`；开发分支 `codex/windows-desktop-migration`。未合并 main、未创建 GitHub Release。

## 架构审查

实现前先提交 [历史迁移架构](https://github.com/SQ-Cheng/GermanWords/blob/v4.2.1-beta.3/docs/windows-desktop-migration.md)，依次核对功能/数据迁移边界、更新/安全/复杂度边界。完成后再核对：

- Windows 只有 `frontend/` 一套学习界面，`shared/` 保持平台无关；没有引入 React、数据库、服务端、常驻服务或通用平台控制器。
- Rust 宿主只暴露 `check_update` / `install_update` 两个应用命令。Excel、音频匹配和星标规则继续使用公共组件；未复制到 Rust。更新安装交给官方插件和 NSIS，不再维护 PowerShell 文件替换器。
- 原生窗口拒绝外部页面导航；页面 CSP 不允许外部请求或内联脚本。更新能力只供本地窗口使用，没有通用 shell / 文件读写桥接。
- 外部浏览器数据迁移明确采用原地址导出、桌面导入；没有声称能自动读取用户浏览器数据。固定应用 identifier，安装文件与 WebView2 数据分开。
- 两个平台的更新签名各自遵循安装协议，同一云盘和维护工具分发；旧 Android / Windows 更新入口保持不变。

## 环境与产物

本机 Windows 11 x64，版本 10.0.26300。使用实际系统 WebView2，Tauri 2、NSIS、Rust stable MSVC。已有 Visual Studio C++ 工具链；此前无可用 Rust，按用户要求安装到 E 盘：Cargo / 缓存 `E:\Rust\cargo`、Rustup / 工具链 `E:\Rust\rustup`，项目 target `E:\Rust\targets\GermanWords`。C 盘本次临时创建的 `.cargo` / `.rustup` 已迁走；本机 target 配置忽略，不进入 Git。

| 云盘文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| GermanWords-Windows-4.2.0-beta.2-x86_64-Setup.exe | 6322936 | `c8c828f757287441049ddd57b3b4451e2a88ea4cf8db0e16b5daa35a47bdfcc4` |
| GermanWords-Windows-4.2.0-beta.3-x86_64-Setup.exe | 6321649 | `1b1d6e4f8d566f34e03540b73bcedcad508f4c17f454999933a0f1bb33b76569` |
| GermanWords-Legacy-Migration-4.2.0-beta.3.zip | 25174 | `5c7129ba7dbb8be1d487dd6ca45df8bb0d990740efb91378a6bfba07e256b657` |

全部上传到用户既有云盘，从公开下载入口逐一读回比对；最后上传 `update-windows-beta.json`。Tauri 更新私钥位于维护者用户目录 `.germanwords/tauri-update.key`，不进入应用或 Git。测试产物位于忽略的 `output/releases/desktop-test/`。

## 安装与真实云盘升级：通过

1. 在隔离目录安装 beta.2，NSIS 退出码 0，生成应用和卸载器，应用报告版本 4.2.0-beta.2。使用固定的隔离 WebView2 profile，避免覆盖用户正式数据。
2. 在该安装中写入测试标记 `desktop_update_probe=preserved` 和 E1 星标 `lernen`。
3. 从应用界面点击「检查更新」，Rust 官方插件通过云盘重定向读取 beta.3 更新信息，显示版本说明；点击「下载并更新」。不是在测试脚本中直接运行目标安装包。
4. 官方插件下载并验签，执行 NSIS 更新，应用自动重启为 4.2.0-beta.3；安装目录保持不变，测试标记和 E1 星标均保留。
5. 实际安装 EXE SHA-256 为 `a266c801d035e35f74522cfa0ea62da83e2b35f5555c9ecd3eeac6e356ee945e`。与构建 EXE 的差异仅为 Tauri 官方 bundle marker 的三个字节（`UNK` → `NSS`）；按官方标记归一化后逐字节一致。
6. 更新后的原生检查返回没有新版本。再次读取旧 `update-beta.json`，版本仍是 4.2.0-beta.2，Android / 旧原型没有被指向桌面安装包。
7. 测试结束运行标准卸载器，退出码 0；应用文件、卸载注册项移除，隔离 WebView2 数据目录保留。没有留下正式安装或后台服务。

## 回归：通过

- `pnpm --dir tests test`：公共解析、460 词 / 460 录音匹配、混合/搜索/星标/语速/主题规则。
- `pnpm --dir tests test:browser`：源码和生成前端的完整既有学习回归，覆盖模式、卡片/列表、混合与乱序、搜索、音频、键盘和主题。
- `node tests/legacy-migration.cjs`：在同一个 file:// 路径替换页面，原星标与偏好保留，导出的 JSON 值一致。
- `node tests/desktop.cjs`：直接针对真实 Tauri WebView2 执行；内置全部词库、实际音频播放与 1.25× 语速、非空星标备份下载、损坏备份不覆盖、导入恢复、重载保持、主题、480–1120 CSS 像素布局、词库抽屉和圆形控件通过。目标 beta.3 云盘升级后再次执行也通过，测试后还原偏好。
- 通过真实窗口尝试导航到外部 HTTPS 页面，被宿主拒绝，仍停留在本地学习页面。
- `cargo fmt -- --check`、`cargo clippy --locked -- -D warnings` 通过；两次 Release 安装包构建及更新签名生成成功。
- Android `assembleDebug lintDebug` 通过，0 error / 2 个既有 warning；本轮没有重新安装或分发 Android APK。

截图：忽略的 `artifacts/desktop-1120.png`、`desktop-800.png`、`desktop-640.png`、`desktop-480.png`、`desktop-update-prompt.png`。测试专用 CDP 端口只对隔离子进程启用，正常运行不启用。

## 验证边界

仅在本机 Windows 11 x64 实际安装和更新。Windows 10、ARM64、不同 DPI 与 WebView2 缺失/完全离线首次安装尚未实测；提供构建与运行时安装说明，不声称全部设备通过。当前安装包约 6 MiB，未包含完整 WebView2 离线运行时。

Tauri 更新包有更新签名，开发安装包尚未配置正式 Authenticode 证书。测试证明了真实升级路径，未另行重测官方签名库的全部攻击场景；没有自行实现第二套加密或安装框架。自定义文件导入保持原 Windows 的会话语义，不新增持久词库管理系统。
