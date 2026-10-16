# 德语单词记忆助手

Android 与 Windows 离线版共用一个仓库，两个客户端分别维护界面与平台功能。

| 目录 | 内容 |
| --- | --- |
| `apps/android/` | Android Studio / Gradle 项目，Java 外壳与 WebView 界面 |
| `apps/windows/` | Windows 浏览器离线版，双击 `De_words_helper.html` 打开 |
| `tools/` | 资源维护与验证脚本 |
| `output/pdf/` | Android 使用说明 |
| `artifacts/verification.md` | 历史设备验证记录 |

Android 开发与使用见 [Android 说明](apps/android/README.md)。Windows 版打开后，点击「导入文件夹」，选择该版本的 `words` 文件夹。

从仓库根目录验证学习引擎：

```powershell
node tools/test-engine.mjs
```

Android 构建：

```powershell
cd apps/android
.\gradlew.bat assembleDebug lintDebug
```

两个平台在同一 `main` 上开发，通过功能分支修改；构建产物与本机 SDK 路径不入库。
