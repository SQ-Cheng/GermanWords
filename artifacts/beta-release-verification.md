# 4.0.2-beta.1 合并与发布检查

日期：2026-10-17。Android versionCode 4，双端版本 4.0.2-beta.1。

- 检查开发分支全部变更；公共层只包含资源、解析器和主题，平台适配仍位于各客户端。没有新增主程序运行时依赖。
- 修复超长卡片滚动位置沿用到下一词的问题；回归验证翻页复位、同词重绘保留位置。
- Node 解析器、Android 学习逻辑与主题测试通过；实际 460 个词条均匹配录音。
- Edge 验证 Windows 源码页面与独立发布目录，覆盖词库、卡片、自测、星标、列表、键盘、实际音频播放、系统主题跟随与手动主题保存。
- Android Debug、Release、测试 APK 构建通过；Debug / Release lint 均无错误，保留已有 OldTargetApi、UnusedAttribute、SetJavaScriptEnabled 三条警告。
- 小米 14 / Android 16 上，Debug 和最终签名 Release APK 均通过真实滑动翻页、进度拖动、100%–200% 字号、320dp 窄屏、圆形控件、自动/昼/夜主题与系统栏、列表自测、原生音频、SAF 导入和横屏回归。测试后恢复学习设置与主题。
- 最终 APK 检查 versionName、versionCode、非 debuggable 状态和 v1/v2/v3 签名。证书 SHA-256 与历史 v1.0.1 APK 相同：`d13d329400a5d4602eded1061f9866d760070979422391ca8ec9941b0ec5c6de`。Beta 沿用开发证书以允许覆盖升级，正式发布仍需独立签名。
- Android APK 的全部界面文件、三份公共脚本/样式及 467 份词库资源与源码逐字节一致，不包含测试脚本或浏览器测试依赖。Windows ZIP 完整性及内容与已测试的独立发布目录一致。
- 发布附件：Android APK、Windows 离线 ZIP、SHA256SUMS.txt。产物位于被 Git 忽略的 `output/releases/4.0.2-beta.1/`；仅源码、测试与文档入库。

未发现剩余合并阻塞问题。验证范围限于上述设备和浏览器，不代表覆盖所有旧版 WebView 或手机。
