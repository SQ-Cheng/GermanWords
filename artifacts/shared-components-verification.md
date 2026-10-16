# 双平台目录与共享组件验证

日期：2026-10-16（Asia/Shanghai）

本次仅整理两个客户端目录、共享词库资源并提取公共解析器。保留各端界面、学习状态与系统功能，不引入框架或运行时依赖。

| 检查 | 结果 |
| --- | --- |
| 原版兼容性 | 8 份 Excel 的 460 个词条及全部解析字段，与目录整理提交中的 Windows 原版完全一致 |
| 公共解析器 | `node tools/test-parser.mjs` 通过；覆盖浏览器 / 原生解压结果一致、表头别名、稀疏行、默认列序、多工作表、Unicode 与无效文件 |
| Android 学习逻辑 | `node tools/test-engine.mjs` 通过；460 个词条全部匹配录音，原有乱序、筛选、自测、进度及音频计时回归通过 |
| Android 干净构建 | 在 `apps/android/` 执行 `gradlew.bat clean assembleDebug lintDebug assembleDebugAndroidTest` 通过 |
| 产物完整性 | APK 与 Windows 发布目录均包含全部 467 个资源，与 `shared/words/` 逐字节一致；公共解析器也与源文件一致 |
| Windows 发布包 | `python tools/build-windows.py` 通过，脚本引用有效，发布包独立于源码目录 |
| Windows 浏览器 | Edge 无头浏览器以本地文件打开源码页面和发布页面，两者均通过目录导入、460 词解析与录音匹配、卡片自测、星标筛选、列表、键盘翻页与实际录音播放；无页面脚本错误 |

Android 测试 APK 已成功编译，但本轮没有连接设备，未执行真机 instrumentation。浏览器验证不替代 Android WebView 与原生文件选择器、MediaPlayer 的设备测试。之前的设备测试记录保留在 `verification.md`。
