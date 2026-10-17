# GermanWords · 德语单词记忆助手

GermanWords 是面向 Android 和 Windows 的离线德语词汇学习工具，支持单词卡片、自测、录音播放和星标复习。两端共用词库与基础数据处理逻辑，分别适配手机和电脑的操作方式。日常学习无需联网。

目前开发人员：SQ-Cheng (Android), freshfish6666 (Windows).

致谢：王老师，以及开发之前版本的同学。

[下载与历史版本](https://github.com/SQ-Cheng/GermanWords/releases) · [问题与建议](https://github.com/SQ-Cheng/GermanWords/issues) · [Android 使用说明（PDF）](output/pdf/GermanWordsAndroid-User-Guide.pdf)

## 功能

- 内置 8 份词表、460 个词条及对应录音，也可导入兼容的词库。
- 支持单单元学习、跨单元混合学习、顺序与乱序浏览。
- 提供卡片和列表自测，按需揭晓答案；支持星标筛选复习。
- 支持德语和中文搜索，兼容变音符号及 ß/ss 匹配。
- 录音支持 0.75×、1×、1.25×、1.5× 语速。
- 提供昼间、夜间和跟随系统三种主题。
- Android 支持滑动翻页、拖动学习进度条及学习位置恢复。

## 最新版本与安装

| 渠道 | 版本 | 说明 |
| --- | --- | --- |
| [GitHub 最新预发布版](https://github.com/SQ-Cheng/GermanWords/releases/tag/v4.2.0-beta.3) | **4.2.0-beta.3** | Android APK 与 Windows x64 桌面安装包，支持从清华云盘检查更新 |
| [清华云盘更新验证版](https://cloud.tsinghua.edu.cn/d/361a8eccb1624c65ae26/) | **4.2.0-beta.4** | 仅递增版本号，无功能改动，用于验证双端更新流程；Android versionCode 为 9 |

以上版本均为 Beta。正式版与历史安装包见 GitHub Releases；预发布版以对应发布页说明为准。

**Android：**下载 APK 后按系统提示安装。应用内更新需要允许此应用安装更新，并由系统确认；覆盖升级须使用相同应用签名。

**Windows：**下载 `GermanWords-Windows-…-x86_64-Setup.exe` 并运行。桌面版使用 Tauri / WebView2，首次安装若缺少 WebView2，安装器会尝试联网下载安装运行环境。当前提供 x64 包。

两端在启动时尝试后台检查更新，成功检查后间隔 24 小时再自动检查；设置中的「检查更新」可立即检查。发现新版本后由用户选择是否下载和安装，断网不影响学习。使用 GitHub beta.3 可验证升级至云盘 beta.4。

旧 Windows HTML 版迁移到桌面版时，需运行新的安装包；可使用发布页提供的迁移 ZIP，在原页面地址导出星标与设置，再导入桌面版。

## 源码与开发

本仓库同时维护 Android 和 Windows 客户端。**主分支当前源码对应 4.1.0-beta.1；4.2.0 桌面版及云盘更新功能位于独立开发分支，尚未合并主分支。**复现已发布版本请检出相应 Git 标签，例如 `v4.2.0-beta.3`，并阅读该版本的构建说明。

主分支目录：

| 目录 | 职责 |
| --- | --- |
| `apps/android/` | Android Studio / Gradle 项目，原生宿主与手机学习界面 |
| `apps/windows/` | Windows 浏览器离线版界面与客户端逻辑 |
| `shared/words/` | 两端共用的 Excel 词库与录音 |
| `shared/` | 词表解析、搜索、录音匹配、星标、语速与主题等公共逻辑 |
| `tools/` | 构建工具 |
| `tests/` | 公共逻辑、浏览器与设备测试入口 |
| `docs/` | 架构与维护文档 |
| `artifacts/` | 验证记录 |
| `output/` | 生成的发布产物及使用说明；构建产物不入库 |

共享层负责数据与通用规则，客户端负责界面、播放及平台能力。修改公共文件后，由构建工具打包至各客户端，无需手动维护副本。结构与维护约定见 [架构说明](docs/architecture.md)，测试环境与入口见 [测试说明](tests/README.md)。

### 构建主分支

克隆仓库后，在功能分支中开发。本机 SDK 路径、密钥和构建产物不提交到 Git。

Android 需要 JDK 17+、Android SDK 35；用 Android Studio 打开 `apps/android/`，或配置 `ANDROID_HOME` 后执行：

```powershell
cd apps/android
.\gradlew.bat assembleDebug lintDebug
```

调试 APK 位于 `apps/android/app/build/outputs/apk/debug/app-debug.apk`。更多说明见 [Android 文档](apps/android/README.md)。

主分支的 Windows 浏览器离线包使用 Python 构建：

```powershell
python tools/build-windows.py
```

将生成的 `output/windows/` 整个文件夹保留在一起，双击其中的 HTML，并导入同目录的 `words/`。用户运行此离线包无需 Python。该命令构建浏览器版；4.2.0 桌面安装包请使用对应标签中的构建说明。

公共逻辑测试需要 Node.js 22 或更高版本，在仓库根目录执行：

```powershell
node tests/test-parser.mjs
node tests/test-engine.mjs
node tests/test-theme.mjs
node tests/test-playback.mjs
node tests/test-vocabulary.mjs
node tests/test-marks.mjs
```
