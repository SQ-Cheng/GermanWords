# GermanWords · 德语单词记忆助手

GermanWords 是离线德语词汇学习工具，提供 Android、Windows 客户端及适用于其他桌面系统的免安装浏览器版，支持单词卡片、自测、录音播放和星标复习。各端共用词库与基础数据处理逻辑，分别适配手机和电脑的操作方式。日常学习无需联网。

目前开发人员：SQ-Cheng (Android), freshfish6666 (Windows).

致谢：王老师，以及开发之前版本的同学。

[下载与历史版本](https://github.com/SQ-Cheng/GermanWords/releases) · [问题与建议](https://github.com/SQ-Cheng/GermanWords/issues) · [Android 使用说明（PDF）](output/pdf/GermanWordsAndroid-User-Guide.pdf)

## 功能

- 内置 8 份词表、460 个词条及对应例句和录音，也可导入兼容的词库。
- 支持单单元学习、跨单元混合学习、顺序与乱序浏览。
- 提供卡片和列表自测，按需揭晓答案；支持星标筛选复习。
- 支持德语和中文搜索，兼容变音符号及 ß/ss 匹配。
- 录音支持 0.75×、1×、1.25×、1.5× 语速。
- 提供昼间、夜间和跟随系统三种主题。
- 提供卡片两侧的翻页按钮及底部学习进度条，拖动时可静音预览；Android 还支持滑动翻页及学习位置恢复。
- 可从词库与设置中提交意见反馈，失败时保留填写内容；浏览器版通过 GitHub 反馈。
- 支持星标和设置备份；Android 还可备份学习位置与模式。备份不包含自定义词库和录音。

## 最新版本与安装

当前最新预发布版为 [**4.2.1-beta.3**](https://github.com/SQ-Cheng/GermanWords/releases/tag/v4.2.1-beta.3)，提供 Android APK、Windows x64 桌面安装包、免安装浏览器 ZIP、旧版迁移包及 SHA-256 校验文件。本版新增浏览器版，与 Windows 共用桌面界面及备份逻辑，并修复 Firefox 进度条轨道显示和 WebKit 字号适配的尺寸观察警告。正式版与历史安装包见 GitHub Releases；预发布版以对应发布页说明为准。

**Android：**下载 APK 后按系统提示安装。覆盖升级须使用相同应用签名。

**Windows：**下载 `GermanWords-Windows-…-x86_64-Setup.exe` 并运行。桌面版使用 Tauri / WebView2，首次安装若缺少 WebView2，安装器会尝试联网下载安装运行环境。当前提供 x64 包。

**macOS / Linux 等桌面系统：**下载浏览器版，完整解压 `GermanWords-Web-…zip` 后用近期版本的 Safari、Firefox、Chrome 或 Edge 打开其中的 `GermanWords/index.html`，无需安装运行环境。浏览器版通过下载新包更新；星标和设置请定期导出备份，路径或浏览器变化可能隔离本地存储。使用与兼容性边界见 [浏览器版说明](apps/web/README.md)。

旧 Windows HTML 版迁移到桌面版时，需运行新的安装包；可使用发布页提供的迁移 ZIP，在原页面地址导出星标与设置，再导入桌面版。操作见 [Windows 说明](apps/windows/README.md)。PDF 对应早期 Android 界面，具体操作以当前应用及平台文档为准。

## 源码与开发

本仓库维护 Android、Windows 及浏览器客户端。开发源码可能领先于公开安装包；复现已发布版本请检出相应 Git 标签，例如 `v4.2.1-beta.3`。功能修改在开发分支中进行，本机 SDK 路径、私钥和构建产物不提交到 Git。

| 目录 | 职责 |
| --- | --- |
| `apps/android/` | Android Studio / Gradle 项目，Java 宿主与手机学习界面 |
| `apps/web/` | 浏览器与 Windows 共用的桌面学习界面、备份及浏览器适配 |
| `apps/windows/frontend/` | Windows 专用的更新、反馈与内置资源适配 |
| `apps/windows/src-tauri/` | Tauri 宿主、平台更新与安装配置 |
| `shared/words/` | 各端共用的 Excel 词库与录音 |
| `shared/` | 词表解析、搜索、录音匹配、星标、语速、主题、反馈表单及版本配置 |
| `tools/` | 构建与维护发布工具 |
| `tests/` | 公共逻辑、浏览器与设备测试入口 |
| `docs/` | 架构与维护文档 |
| `artifacts/` | 验证记录 |
| `output/` | 生成的发布产物及使用说明；构建产物不入库 |

共享层负责数据与通用规则，客户端负责界面、播放及平台能力。公共文件由构建工具自动打包，无需手动维护副本。结构与维护约定见 [架构说明](docs/architecture.md)。

### Android

需要 JDK 17+、Android SDK 35。用 Android Studio 打开 `apps/android/`，或配置 `ANDROID_HOME` 后执行：

```powershell
cd apps/android
.\gradlew.bat assembleDebug lintDebug
```

调试 APK 位于 `apps/android/app/build/outputs/apk/debug/app-debug.apk`。更多说明见 [Android 文档](apps/android/README.md)。

### Windows

需要 Python 3.10+、Node.js 22+、pnpm、Rust stable MSVC、Visual Studio C++ 桌面工具链和 WebView2。从仓库根目录执行：

```powershell
pnpm --dir apps/windows install --frozen-lockfile
pnpm --dir apps/windows dev
```

开发入口监听前端与共享资源，修改后自动重建并重启窗口。打包前配置仓库外的 `TAURI_SIGNING_PRIVATE_KEY`，再执行 `pnpm --dir apps/windows build`。生成的 NSIS 安装包与更新签名位于 Cargo target 的 `release/bundle/nsis/`。环境配置、备份迁移与打包细节见 [Windows 文档](apps/windows/README.md)。

### 浏览器版

构建只需 Python 3.10+，从仓库根目录执行：

```powershell
python tools/build-web.py
```

生成 `output/web/GermanWords/` 和 `output/web/GermanWords-Web-版本号.zip`。解压 ZIP 后直接打开 HTML，也可将完整目录托管到静态网站；最终用户无需 Python 或本地服务器。Windows 和浏览器复用同一套桌面界面，浏览器包不含原生安装、更新或上传代码。

### 测试

公共逻辑与桌面适配回归需要 Node.js 22+ 和 pnpm：

```powershell
pnpm --dir tests test
```

浏览器、原生更新策略、发布工具和真机测试的环境及命令见 [测试说明](tests/README.md)。测试组件与开发依赖不打包进主应用。
