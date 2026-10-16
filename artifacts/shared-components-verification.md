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

## 合并前复查（4.0.1）

- 逐项比较 Android 原引擎与迁移后引擎：除解析代码提取、调用入口和注释外，学习状态与界面逻辑保持一致。原生 Java 宿主保持不变。
- 公共层只有一个解析文件；平台差异只通过一个解压函数参数处理，未引入框架、公共状态层、依赖注入容器或新运行时依赖，未发现过度工程或阻断合并的新增缺陷。
- 调试版、未签名 Release、测试 APK 的干净构建及 lint 通过；调试版与 Release 均完整包含共享解析器和 467 个原始资源。
- 将调试 APK 中的实际页面与资源放入隔离 HTTP 服务，在 Edge 中执行现有 `smoke.js`：浏览器解压路径和模拟 Android 桥接路径均通过。桥接模拟时禁用 `DecompressionStream`，验证原生解压入口独立可用；另验证备份、恢复、重新加载后的进度与星标、原生播放调用。
- 增量构建验证：临时修改公共解析器、增加后删除资源，Gradle 与 Windows 构建均正确更新输出，清理已删除资源，索引从 467 项变为 468 项后正确恢复。所有临时修改均已还原。
- Android APK 元数据确认为 `versionName=4.0.1`、`versionCode=3`；Windows 页面标题、可见版本和 README 同步更新到 4.0.1。
- 已保留远端主分支新增的开发者、致谢信息，并恢复仓库首页的安装包与使用说明入口。旧版验证记录和 Releases 保留各自原版本，不宣称已发布 4.0.1 安装包。

Android 测试 APK 已成功编译，但本轮没有连接设备，未执行真机 instrumentation。浏览器验证不替代 Android WebView 与原生文件选择器、MediaPlayer 的设备测试。之前的设备测试记录保留在 `verification.md`。
