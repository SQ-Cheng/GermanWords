# 德语单词记忆助手

Android 与 Windows 离线版共用 [GermanWords 仓库](https://github.com/SQ-Cheng/GermanWords)，两个客户端分别维护界面与平台功能。项目根文件夹为 `GermanWords/`；Android Studio 仍打开其中的 `apps/android/`。

当前源码版本：**Android 4.0.1**（versionCode 3）、**Windows 4.0.1**。已有 Releases 安装包仍以各发布条目的版本号为准。

目前开发人员：SQ-Cheng (Android), freshfish6666 (Windows).

致谢：王老师，以及开发之前版本的同学。

[Android 安装包](https://github.com/SQ-Cheng/GermanWords/releases/latest) · [Android PDF 使用说明](output/pdf/GermanWordsAndroid-User-Guide.pdf) · [问题与建议](https://github.com/SQ-Cheng/GermanWords/issues)

| 目录 | 内容 |
| --- | --- |
| `apps/android/` | Android Studio / Gradle 项目，Java 外壳与 WebView 界面 |
| `apps/windows/` | Windows 浏览器离线版，双击 `De_words_helper.html` 打开 |
| `shared/words/` | 两端共用的 Excel 词库与录音，唯一资源源目录 |
| `shared/parser.js` | 两端共用的 XLSX 读取、表头识别与词条解析 |
| `shared/theme.js`、`shared/theme.css` | 两端共用的主题偏好与昼夜配色 |
| `tools/` | 构建工具 |
| `tests/` | 解析器、学习引擎测试及真机测试入口 |
| `output/pdf/` | Android 使用说明 |
| `artifacts/verification.md` | 历史设备验证记录 |

两端均内置 8 份词表、460 个词条及对应录音，安装或解压后可离线学习。Android 开发与使用见 [Android 说明](apps/android/README.md)，更新记录见 [CHANGELOG](apps/android/CHANGELOG.md)。Windows 版用新版 Edge 或 Chrome 打开；直接打开源码页面时，点击「导入文件夹」，选择 `shared/words/`。

两端默认跟随系统昼夜模式，可在侧栏的「主题」设置中选择「跟随系统／昼间／夜间」，选择自动保存。Android 支持单屏卡片、滑动翻页和拖动底部进度条，保留原有学习模式名称；圆形操作按钮在大字号下保持圆形。

Windows 离线发布包：

```powershell
python tools/build-windows.py
```

将生成的 `output/windows/` 整个文件夹交给用户，保留 HTML、公共脚本与样式、`words/`。双击其中的 HTML，导入同目录的 `words/` 即可使用；用户无需 Python。生成目录不入库，每次构建会重新生成。Windows 保留原有学习界面与功能，不增加 Android 的备份和位置恢复功能。

从仓库根目录验证公共解析器和 Android 学习引擎（Node.js 22 或更高版本）：

```powershell
node tests/test-parser.mjs
node tests/test-engine.mjs
node tests/test-theme.mjs
```

Android 构建：

```powershell
cd apps/android
.\gradlew.bat assembleDebug lintDebug
```

需要 JDK 17+ 与 Android SDK 35；用 Android Studio 打开 `apps/android/` 配置 SDK，或通过 `ANDROID_HOME` 指定 SDK。`local.properties` 不入库。调试 APK 位于 `apps/android/app/build/outputs/apk/debug/app-debug.apk`；本轮只更新源码，不自动创建 Releases。

Gradle 自动打包公共脚本、样式和 `shared/words/` 并生成资源索引，更新公共文件无需手动复制。Android 生成资源位于 `apps/android/app/build/generated/sharedAssets/`。

公共解析器只处理文件与数据，不依赖页面或 Android。浏览器默认使用 `DecompressionStream` 解压；Android 在 `mobile.js` 中提供原生解压函数，通过 `WordParser.read(file, inflateRaw)` 传入。两端界面、音频播放、文件导入与学习状态保持各自实现。Windows 发布脚本仅复制公共文件并调整脚本路径。

本次整理的验证范围见 [共享组件验证记录](artifacts/shared-components-verification.md)。

布局、进度和主题的验证见 [界面验证记录](artifacts/mobile-ui-verification.md)，测试入口和环境要求见 [tests/README](tests/README.md)。测试依赖仅位于 `tests/`，不参与客户端打包。

两个平台在同一 `main` 上开发，通过功能分支修改；构建产物与本机 SDK 路径不入库。
