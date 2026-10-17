# 德语单词记忆助手

Android 与 Windows 离线版共用 [GermanWords 仓库](https://github.com/SQ-Cheng/GermanWords)，两个客户端分别维护界面与平台功能。项目根文件夹为 `GermanWords/`；Android Studio 仍打开其中的 `apps/android/`。

本开发分支：**4.2.0-beta.3**（Android 源码 versionCode 8），Windows 已迁移为 Tauri 2 / WebView2 桌面程序。GitHub 已发布版本仍为 4.1.0-beta.1，云盘 Android 与旧 Windows 测试版仍为 4.2.0-beta.2。

Windows 桌面安装包与测试更新见 [清华云盘](https://cloud.tsinghua.edu.cn/d/361a8eccb1624c65ae26/)；从桌面 beta.2 安装包起步，可测试升级到 beta.3。首次从旧 HTML 版迁移需运行新安装包，并导入旧星标/设置。详见 [Windows 开发与迁移](apps/windows/README.md) 和 [更新维护](docs/updates.md)。

目前开发人员：SQ-Cheng (Android), freshfish6666 (Windows).

致谢：王老师，以及开发之前版本的同学。

[Android APK / Windows 离线包（Beta）](https://github.com/SQ-Cheng/GermanWords/releases/tag/v4.1.0-beta.1) · [Android PDF 使用说明](output/pdf/GermanWordsAndroid-User-Guide.pdf) · [问题与建议](https://github.com/SQ-Cheng/GermanWords/issues)

| 目录 | 内容 |
| --- | --- |
| `apps/android/` | Android Studio / Gradle 项目，Java 外壳与 WebView 界面 |
| `apps/windows/` | Tauri 桌面宿主与唯一一套 Windows 前端，按用户安装的 NSIS 安装包 |
| `shared/words/` | 两端共用的 Excel 词库与录音，唯一资源源目录 |
| `shared/parser.js` | 两端共用的 XLSX 读取、表头识别与词条解析 |
| `shared/theme.js`、`shared/theme.css` | 两端共用的主题偏好与昼夜配色 |
| `shared/playback.js` | 语速偏好保存与有效值校验；各端适配现有播放器 |
| `shared/audio.js`、`shared/marks.js` | 公共录音索引/匹配与原单元星标存储 |
| `shared/vocabulary.js` | 搜索匹配、多单元读取与词条来源标识 |
| `shared/app-config.json` | 双端版本、更新来源、通道与更新验签公钥 |
| `tools/` | 构建与维护发布工具 |
| `tests/` | 解析器、学习引擎测试及真机测试入口 |
| `output/pdf/` | Android 使用说明 |
| `artifacts/verification.md` | 历史设备验证记录 |

两端均内置 8 份词表、460 个词条及对应录音，安装或解压后可离线学习。Android 开发与使用见 [Android 说明](apps/android/README.md)，更新记录见 [CHANGELOG](apps/android/CHANGELOG.md)。Windows 桌面版首次启动即加载内置词库。前端源码仍可用新版 Edge / Chrome 打开做开发检查，此时手动导入 `shared/words/`。

两端默认跟随系统昼夜模式，可在侧栏的「主题」设置中选择「跟随系统／昼间／夜间」，选择自动保存。Android 支持单屏卡片、滑动翻页和拖动底部进度条，保留原有学习模式名称；圆形操作按钮在大字号下保持圆形。

4.1.0-beta.1 支持以下学习功能：

- 在词库勾选至少两个单元，点击「混合学习」，再用「乱序」跨单元学习；再次点击可恢复顺序。直接点单元名称返回单单元。星标按原单元保存，Android 可恢复混合范围、位置与乱序顺序。
- 搜索当前学习范围中的德语或中文，可与星标筛选和乱序组合。Android 在词库中输入后点「查看」；Windows 在顶部输入。搜索不区分大小写，支持变音符号与 ß/ss；清空后恢复当前范围，搜索词不持久化。
- 两端侧栏可选 0.75×、1×、1.25×、1.5× 语速，自动保存并应用于当前及后续录音。Windows 普通模式点击卡片即可重播；卡片和列表自测均按需揭晓答案，答案隐藏时不通过音频、例句或背景颜色泄露。

全部 GitHub issues、实现方案与验证记录见 [本轮 issue 记录](docs/issues-2026-10-17.md)。课本例句继续暂缓；软件内更新在当前分支中测试。

Beta 发布页提供可安装 APK、Windows 离线 ZIP 和 SHA256 校验文件。该历史版本的 Windows ZIP 解压后启动；新桌面版使用 Setup.exe 安装。Android beta 使用与历史测试包相同的开发签名，便于覆盖升级；发布构建关闭调试，不包含测试组件。正式发布前应配置独立发布签名。PDF 为早期 Android 版说明，新功能以本 README 为准。

Windows 桌面开发和打包：

```powershell
pnpm --dir apps/windows install --frozen-lockfile
pnpm --dir apps/windows dev
# 配置仓库外的 TAURI_SIGNING_PRIVATE_KEY 后：
pnpm --dir apps/windows build
```

需要 Rust MSVC、Visual Studio C++ 工具链及系统 WebView2。用户无需 Python、Node 或 Rust；这些仅是开发依赖。安装包缺少 WebView2 时引导安装运行时。资源准备仍使用 `python tools/build-windows.py`，生成 `output/windows/web/` 和旧版迁移 ZIP，不提交构建产物。

从仓库根目录验证公共解析器和 Android 学习引擎（Node.js 22 或更高版本）：

```powershell
node tests/test-parser.mjs
node tests/test-engine.mjs
node tests/test-theme.mjs
node tests/test-playback.mjs
node tests/test-vocabulary.mjs
node tests/test-marks.mjs
```

Android 构建：

```powershell
cd apps/android
.\gradlew.bat assembleDebug lintDebug
```

需要 JDK 17+ 与 Android SDK 35；用 Android Studio 打开 `apps/android/` 配置 SDK，或通过 `ANDROID_HOME` 指定 SDK。`local.properties` 不入库。调试 APK 位于 `apps/android/app/build/outputs/apk/debug/app-debug.apk`。发布构建使用 `assembleRelease`，并在签名后发布 APK。

Gradle 自动打包公共脚本、样式和 `shared/words/` 并生成资源索引，更新公共文件无需手动复制。Android 生成资源位于 `apps/android/app/build/generated/sharedAssets/`。

公共解析器只处理文件与数据，不依赖页面或 Android。浏览器默认使用 `DecompressionStream` 解压；Android 在 `mobile.js` 中提供原生解压函数，通过 `WordParser.read(file, inflateRaw)` 传入。两端界面、音频播放、文件导入与学习状态保持各自实现。Windows 构建脚本复制公共文件与资源并生成索引，Tauri 承载本地学习页面；原生宿主只开放检查更新和安装更新两个命令。

`vocabulary.js` 组合公共解析器读取所选词表，保留单单元的旧词条 ID，只为混合词条附加单元标识；共享层不访问 Android。语速在浏览器使用 `Audio.playbackRate`，Android 宿主使用 [MediaPlayer PlaybackParams](https://developer.android.com/reference/android/media/MediaPlayer#setPlaybackParams(android.media.PlaybackParams))，不增加音频框架或网络依赖。

本次整理的验证范围见 [共享组件验证记录](artifacts/shared-components-verification.md)。

布局、进度和主题的验证见 [界面验证记录](artifacts/mobile-ui-verification.md)，测试入口和环境要求见 [tests/README](tests/README.md)。测试依赖仅位于 `tests/`，不参与客户端打包。

两个平台在同一 `main` 上开发，通过功能分支修改；构建产物与本机 SDK 路径不入库。

代码层级和维护边界见 [架构说明](docs/architecture.md)；本次 Beta 的检查范围见 [4.1.0 合并与发布验证记录](artifacts/4.1.0-beta.1-verification.md)。

Windows 迁移的两轮架构审查见 [迁移设计](docs/windows-desktop-migration.md)，安装与云盘升级验证见 [桌面验证记录](artifacts/windows-desktop-verification.md)。
