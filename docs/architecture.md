# 结构与维护约定

这是 Android Java 宿主与 Windows Tauri 宿主各自承载本地 Web 界面的离线项目，无自建服务端或前端框架。两个平台继续通过同一云盘分发。

| 层 | 文件与职责 |
| --- | --- |
| 公共数据 | `shared/parser.js` 读取 XLSX；`vocabulary.js` 搜索、组合词表并附加来源；`audio.js` 建索引和匹配录音，不播放、不创建 URL |
| 公共偏好 | `shared/marks.js` 保存原单元星标，存储不可用时降级到会话内存；`playback.js` 保存并校验语速，不访问页面 |
| 公共反馈表单 | `shared/feedback.js` / `.css` 负责表单、校验和提交状态；发送函数由平台适配层注入 |
| 公共主题 | `shared/theme.js` 保存主题并设置页面主题；`theme.css` 定义配色 |
| Android 界面 | `apps/android/app/src/main/assets/web/`：HTML、CSS、`engine.js` 负责学习交互；`mobile.js` 负责 Android 偏好、进度、触摸和原生桥接适配 |
| Android 宿主 | `MainActivity.java` 负责本地资源拦截、文件选择/导入、原生解压、MediaPlayer 与系统栏；平台 API 不进入共享层 |
| Windows 界面 | `apps/windows/frontend/` 的 `index.html` / `windows.css` / `app.js` 负责结构、布局、学习及音频；`desktop.js` 只做桌面资源、更新交互和备份 |
| 更新配置与宿主 | `shared/app-config.json` 唯一维护版本、来源和验签公钥；Windows `src-tauri/` 官方更新插件与 Android `UpdateManager` / `UpdateReceiver` 处理平台下载和安装，不进入学习引擎 |
| 构建与测试 | `tools/` 放构建与维护发布工具，`tests/` 放 Node/浏览器/设备入口，标准 `src/androidTest/` 放设备测试组件；产物和本机配置不入库 |

脚本采用普通 script 加载，源码和生成前端可直接打开做浏览器回归；正式桌面包由 Tauri 加载内置资源。解析器与词表组合是录音匹配器的依赖；HTML 在客户端逻辑之前加载公共脚本。Android Gradle 与 Windows 构建脚本自动复制公共 JS/CSS/JSON，修改共享文件无需手动同步副本。

两端保留各自界面与平台会话状态，不用通用控制器强行统一列表、音频播放器和 Android 备份流程。重复的解析、搜索、录音匹配、星标和语速规则则只在共享层维护。浏览器 Blob URL 的创建/释放由客户端负责，原生播放器的生命周期由 Java 宿主负责。

双端备份使用 `MarkStore.readAll()` / `replaceAll()`，不直接读写星标存储键；这保证持久存储不可写时，备份与界面仍使用同一份会话数据。主题通过 `AppTheme.getMode()` 读取，语速通过 `Playback.getRate()` 读取。平台备份格式可分别保留，输入字段在改变状态前验证。

单单元词条保留旧 ID 和原有存储键；混合词条使用单元名和旧 ID 组成唯一 ID，并保留 `sourceBook` / `sourceRoot`。星标仍写回原单元；混合顺序和位置单独保存。读取全部成功且请求仍是最新时才切换词表，失败和过期读取不得覆盖当前学习状态。搜索词不持久化，无结果不得抹除已保存位置。

修改共享数据规则后运行 `pnpm --dir tests test`；修改任一界面还需跑浏览器回归或真机测试，入口见 `tests/README.md`。双端版本号在 `shared/app-config.json`，Gradle 和 Windows 打包脚本读取；versionCode 必须递增。发布 APK 使用 Release 构建并验证签名；Windows 正式分发 NSIS 安装包，内置 HTML、公共 JS/CSS 和词库。Beta 暂沿用历史开发证书以允许升级，正式发布前需制定独立签名迁移方案。

双端读取同一个更新索引，版本化安装包置于各自版本子目录；Android 使用 RSA 载荷与 APK 签名校验，Windows 使用 Tauri 官方格式与安装器签名。`tools/publish-update.py` 校验双端产物、上传并读回核对后最后发布索引，维护端写链接不进入客户端。

意见反馈表单不接触平台 API，`mobile.js` / `desktop.js` 注入发送函数，并负责打开表单前关闭词库、暂停音频；原生 `FeedbackSender` / `feedback.rs` 负责基本设备元数据及单文件上传。Android 更新与反馈复用 `ServiceHttp` 的来源、重定向和响应大小限制；Windows 复用原生 HTTPS 客户端限制。只在用户提交时发送，不读取学习存储。Android 反馈队列独立于导入/备份队列，均随 Activity 关闭；Windows 事件在脚本中绑定，避免违反 CSP。Windows 显示版本由构建工具从公共配置注入，源码页面不重复维护版本号。客户端只包含只读更新入口与仅上传反馈入口，二者不包含维护者写权限。详细格式、迁移边界与发布命令见 [更新维护](updates.md)。
