# 德语单词记忆助手

Android 与 Windows 离线版共用一个仓库，两个客户端分别维护界面与平台功能。

| 目录 | 内容 |
| --- | --- |
| `apps/android/` | Android Studio / Gradle 项目，Java 外壳与 WebView 界面 |
| `apps/windows/` | Windows 浏览器离线版，双击 `De_words_helper.html` 打开 |
| `shared/words/` | 两端共用的 Excel 词库与录音，唯一资源源目录 |
| `shared/parser.js` | 两端共用的 XLSX 读取、表头识别与词条解析 |
| `tools/` | 资源维护与验证脚本 |
| `output/pdf/` | Android 使用说明 |
| `artifacts/verification.md` | 历史设备验证记录 |

Android 开发与使用见 [Android 说明](apps/android/README.md)。直接打开 Windows 源码页面时，点击「导入文件夹」，选择 `shared/words/`。

Windows 离线发布包：

```powershell
python tools/build-windows.py
```

将生成的 `output/windows/` 整个文件夹交给用户。双击其中的 HTML，导入同目录的 `words/` 即可使用；用户无需 Python。生成目录不入库，每次构建会重新生成。

从仓库根目录验证公共解析器和 Android 学习引擎（Node.js 22 或更高版本）：

```powershell
node tools/test-parser.mjs
node tools/test-engine.mjs
```

Android 构建：

```powershell
cd apps/android
.\gradlew.bat assembleDebug lintDebug
```

Gradle 自动打包 `shared/parser.js` 和 `shared/words/` 并生成资源索引，更新公共文件无需手动复制。Android 生成资源位于 `apps/android/app/build/generated/sharedAssets/`。

公共解析器只处理文件与数据，不依赖页面或 Android。浏览器默认使用 `DecompressionStream` 解压；Android 在 `mobile.js` 中提供原生解压函数，通过 `WordParser.read(file, inflateRaw)` 传入。两端界面、音频播放、文件导入与学习状态保持各自实现。Windows 发布脚本仅复制公共文件并调整脚本路径。

本次整理的验证范围见 [共享组件验证记录](artifacts/shared-components-verification.md)。

两个平台在同一 `main` 上开发，通过功能分支修改；构建产物与本机 SDK 路径不入库。
