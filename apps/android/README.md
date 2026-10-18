# 德语单词 Android

本仓库的 Android Studio 项目，来自「德语单词记忆助手 4.0」。Windows 离线版位于 `../windows/`。

[下载安装包](https://github.com/SQ-Cheng/GermanWords/releases/tag/v4.2.1-beta.1) · [PDF 使用说明](../../output/pdf/GermanWordsAndroid-User-Guide.pdf) · [图片使用说明](../../output/pdf/GermanWordsAndroid-User-Guide.png) · [问题与建议](https://github.com/SQ-Cheng/GermanWords/issues)

## 使用

应用名称：**德语单词**，公开版本与下载以发布页为准，源码版本统一维护于 `shared/app-config.json`。首次打开直接进入 E1；课程标题右侧的菜单可选择 E1–E7 或「虚词大盘点」。内置 8 份 Excel、460 个词条及全部对应录音，安装后无需联网。

卡片通过左右滑动或外接键盘 ← / → 翻页；底部进度条可以拖动，拖动时预览位置，松手后跳转并保存进度。乱序、星标筛选和列表模式下均按当前展示顺序定位；空列表或仅一个词时禁用滑块。主页面保持一屏，超长词条或例句只在卡片内部滚动。学习模式名称与原版一致，星标、发音和列表操作中的圆形按钮在大字号下保持等宽等高。

词库侧栏中的「主题」默认跟随系统，可选择昼间或夜间；设置自动保存在本机。Android 状态栏、导航栏同时适配，切回「跟随系统」后会响应系统主题变化。

混合学习与搜索：勾选至少两个单元后点「混合学习」，可跨单元乱序，保留原单元星标并恢复混合进度；直接点单元名称返回单单元。词库的搜索框按德语或中文筛选当前范围，输入后点「查看」，清空恢复当前词表。侧栏「语速」可选 0.75× / 1× / 1.25× / 1.5×，自动保存。

| 网页版功能 | Android 版本 |
| --- | --- |
| 导入整个文件夹、导入 XLSX | 系统文件选择器；递归读取子文件夹并保存到应用内部存储 |
| 多工作表、表头别名、例句 | 保留原版解析规则；原生 Java 解压，不依赖新版浏览器解压接口 |
| 普通 / 中文 / 德语自测 | 卡片和列表均支持；列表逐条显示或隐藏答案 |
| 名词冠词、复数、背景颜色 | 保留 der / die / das 对应颜色；答案揭晓前不泄露颜色 |
| 卡片、列表、乱序、星标筛选 | 手机列表改为纵向词条；再次点击乱序恢复 Excel 顺序，筛选保留乱序 |
| 音频匹配、手动及自动播放 | 保留路径、大小写、变音字符和同名单元匹配；Android MediaPlayer 播放 |
| 星标保存、键盘快捷键 | 保留；新增每词表位置与乱序顺序保存、左右滑动、进度备份和恢复 |

词库菜单中「导入文件夹」可选择包含 Excel 和音频的文件夹。也可多选单个 `.xlsx` 和音频文件。导入后复制到应用内部存储，之后不依赖原始文件路径。旧版 `.xls` 与网页版一样需在 Excel/WPS 中另存为 `.xlsx`。

「备份学习进度」导出星标、学习位置/模式、主题和语速 JSON；通过「导入 Excel / 音频 / 备份」恢复。旧备份不含主题/语速时保留当前值，非法字段会在替换星标之前被拒绝。备份不包含自定义 Excel 和音频，需要另行保留原文件。

## 兼容与架构

- 最低 Android 6.0（API 23）；compileSdk / targetSdk 35。
- 纯 Java Android 宿主 + 本地 HTML/CSS/JavaScript 学习引擎，不含 CPU 架构专属原生库，适用于 ARM、ARM64 和 x86 设备。
- 支持手机、横屏、平板、刘海和系统栏边距。跟随系统字体大小，大字体保持卡片和底部进度在一屏内，超长词条或例句在卡片内部滚动；真机已测试 100%–200% 文本缩放及 320dp 窄屏。建议使用可更新的 Android System WebView；页面布局需要 Chromium 87 及以上，Android 6.0 的原始旧 WebView 应先更新。
- 仅原生更新器使用互联网权限，并申请由用户授权的安装应用权限；不申请整个存储空间权限。使用系统文件选择器授权读取；固定 HTTPS 本地域名的资源由应用拦截提供，禁止外部页面、file:// 和内容 URI 浏览。
- 发音使用本地录音，不要求设备安装德语 TTS。音频格式支持程度取决于设备解码器；内置 MP3 全部完成匹配检查。
- 原生文件选择器与本地 WebView 资源的做法参考 [Android 文件访问文档](https://developer.android.com/training/data-storage/shared/documents-files) 和 [加载应用内网页内容](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)。

## 开发与编译

用 Android Studio 打开 `apps/android/`。以下 Gradle 命令在该目录执行。当前电脑使用 `E:\Android Studio\jbr` 与 `E:\Android\SDK`；其他电脑需修改 `local.properties`。项目使用 Android Gradle Plugin 8.8.0、Gradle 8.11.1，Gradle Wrapper 已包含。

PowerShell：

```powershell
$env:JAVA_HOME = 'E:\Android Studio\jbr'
.\gradlew.bat assembleDebug lintDebug
node ..\..\tests\test-engine.mjs
```

APK：`app/build/outputs/apk/debug/app-debug.apk`。这是使用 Android 默认开发签名的可安装测试版本。GitHub beta APK 由 `assembleRelease` 构建后以同一开发证书签名，关闭调试且不包含测试组件，可覆盖历史测试包；上架或正式发布需要独立发布签名。

发布工具通过 Android SDK 的 `aapt` / `apksigner` 检查包名、实际版本、嵌入配置和证书；SDK 由 PATH、`ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 定位。支持的升级证书指纹记录在 `release-certificate.sha256`，它是公开身份信息，不是私钥。正式签名迁移须另行设计，不能只修改指纹来绕过现有设备的签名要求。

`engine.js`、`index.html`、`mobile.css`、`mobile.js` 直接维护 Android 界面与学习逻辑。`../../shared/` 维护公共解析器、词表组合与搜索、录音匹配、星标存储、主题、语速偏好及词库；Gradle 构建时自动打包并生成资源索引。Windows 离线包使用相同的公共文件。共享脚本不直接调用 Android，由 `mobile.js` 适配原生系统主题、系统栏、播放器及反馈提交。

仓库根目录统一使用 Git 管理；历史标签 `v1.0.0`、`v1.0.1` 保留早期 Android 实现；从 4.0.1 起两端统一版本号。构建目录、APK、设备截图、日志和本机 SDK 路径不入库。

## 验证

- `../../tests/test-engine.mjs`：读取实际 8 份 Excel；460/460 词条都匹配录音；覆盖乱序切换与恢复、筛选后的完整顺序保存、列表双向自测、自动发音计时器、失效或失败的异步读取、星标、空筛选及特殊字符。
- `app/src/androidTest/`：在手机真实 WebView 中测试同一学习引擎、每词表位置恢复、列表、返回操作与触控布局；测试原生 MediaPlayer 和文件内容 URI 导入流程。测试专用内容提供器只在测试 APK 中存在。
- 真机：小米 14（23127PN0CC），Android 16 / API 36，1200 × 2670，Android System WebView 143。实际测试范围以 `../../artifacts/verification.md` 为准；没有在所有旧手机或所有厂商设备上测试。

运行真机测试：

```powershell
.\gradlew.bat assembleDebug assembleDebugAndroidTest
& 'E:\Android\SDK\platform-tools\adb.exe' install -r .\app\build\outputs\apk\debug\app-debug.apk
& 'E:\Android\SDK\platform-tools\adb.exe' install -r .\app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk
& 'E:\Android\SDK\platform-tools\adb.exe' shell am instrument -w cn.study.germanwords.test/cn.study.germanwords.SmokeInstrumentation
```

部分小米系统需要在运行测试时另行启动应用，并允许 USB 安装。测试会恢复原有星标、学习设置和导入目录。

当前电脑可直接运行 `python ..\..\tests\android\run-device.py 52ec00da`，脚本会安装两个 APK、启动测试提供器并处理前台启动。测试结束后，可用 `adb uninstall cn.study.germanwords.test` 移除测试辅助包；主应用保留。

## GitHub 项目与反馈

公开仓库：[SQ-Cheng/GermanWords](https://github.com/SQ-Cheng/GermanWords)。源代码、更新记录与 PDF 使用说明在仓库中；[Releases](https://github.com/SQ-Cheng/GermanWords/releases) 提供可安装 APK 和说明书下载。

可在应用“词库与设置 → 意见反馈”填写并提交建议，无需登录。提交附带时间、基本设备信息和应用版本，不包含学习记录；失败时保留内容。也可登录 GitHub，在 [Issues](https://github.com/SQ-Cheng/GermanWords/issues) 中点击 **New issue**。描述操作步骤、预期结果、实际情况，并提供手机型号、Android 版本和应用版本；需要时附截图。

也可扫描使用说明末尾的问卷星二维码填写反馈；说明书提供 PDF 和高清 PNG 两种格式。

云盘更新测试与维护见 [更新说明](../../docs/updates.md)。版本统一维护于 `shared/app-config.json`，Gradle 直接读取；更新检查、下载、验签和安装由 `UpdateManager` / `UpdateReceiver` 完成，WebView 仍只能读取本地资源。

已下载更新在等待系统安装来源授权时保留待安装记录。返回应用或重新启动后重新校验缓存的大小、哈希、版本、包名和签名再提交系统安装；缓存丢失或损坏则清理记录并提示重新检查。取消授权提示也会清理该待安装包。
