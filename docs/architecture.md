# 结构与维护约定

这是 Android Java 宿主、Windows Tauri 宿主与免安装浏览器版组成的离线项目，无自建服务端或前端框架。原生端保留各自安装及更新流程，浏览器端分发完整静态 ZIP，也可静态托管。

| 层 | 文件与职责 |
| --- | --- |
| 公共数据 | `shared/parser.js` 读取 XLSX；`vocabulary.js` 搜索、组合词表并附加来源；`audio.js` 建索引和匹配录音，不播放、不创建 URL |
| 公共课程目录 | `shared/library.js` 管理课程、内置与导入文件及稳定词表键，不解析或播放；`library.css` 提供课程选择器和词库分组样式 |
| 公共偏好 | `shared/marks.js` 保存原单元星标，存储不可用时降级到会话内存；`playback.js` 保存并校验语速，不访问页面 |
| 公共反馈表单 | `shared/feedback.js` / `.css` 负责表单、校验和提交状态；发送函数由平台适配层注入 |
| 公共主题 | `shared/theme.js` 保存主题并设置页面主题；`theme.css` 定义配色 |
| Android 界面 | `apps/android/app/src/main/assets/web/`：HTML、CSS、`engine.js` 负责学习交互；`mobile.js` 负责 Android 偏好、进度、触摸和原生桥接适配 |
| Android 宿主 | `MainActivity.java` 负责本地资源拦截、文件选择/导入、原生解压、MediaPlayer 与系统栏；平台 API 不进入共享层 |
| 桌面共用界面 | `apps/web/index.html` / `app.css` / `app.js` 负责 Windows 和浏览器的结构、布局、学习及音频；`backup.js` 负责两者共用的备份格式与校验 |
| 桌面平台适配 | `apps/windows/frontend/desktop.js` 负责 Tauri 内置资源、原生更新与反馈；`update-dialog.html` 仅加入 Windows 包。`apps/web/browser.js` 负责浏览器内置资源与 GitHub 外链，不调用原生能力 |
| 更新配置与宿主 | `shared/app-config.json` 唯一维护版本、来源和验签公钥；Windows `src-tauri/` 官方更新插件与 Android `UpdateManager` / `UpdateReceiver` 处理平台下载和安装，不进入学习引擎 |
| 构建与测试 | `tools/` 放构建与维护发布工具，`tests/` 放 Node/浏览器/设备入口，标准 `src/androidTest/` 放设备测试组件；产物和本机配置不入库 |

脚本采用普通 script 加载；Windows 包由 Tauri 加载内置资源，浏览器包支持 file:// 与静态 HTTP(S)。解析器与词表组合是录音匹配器的依赖；HTML 在客户端逻辑之前加载公共脚本。Android Gradle 与桌面构建工具自动复制公共资源，修改共享文件无需手动同步副本。

`tools/frontend.py` 统一准备两种桌面包的共用页面、依赖和词库；`build-windows.py` 添加 Tauri 配置和旧版迁移包，`build-web.py` 生成浏览器 ZIP。两端均通过构建生成的 `library-data.js` 同步取得 `BuiltInLibrary` 元数据，先建立完整目录，再异步读取选中词表，避免启动索引读取覆盖用户导入或课程切换。Windows 按需读取包内 XLSX；浏览器清单额外将原始 XLSX 编码为 JS 数据，以绕过本地文件 fetch 的跨来源限制。运行时仍用 `WordParser`，录音通过相对 URL 读取，不嵌入全部音频。

原始词库只维护在 `shared/words/german1/` 与 `german2/`，课程名称与根目录统一定义于 `StudyLibrary.courses`。可见目录是当前课程内置词表加全部导入词表，音频索引则包含所有文件。德语（1）保留原文件名存储键；德语（2）使用 `@course:german2:` 前缀。导入键在全部内置键预留后分配，与课程选择无关；同名词表保留路径后缀以供区分。内置录音只能来自本课程或用户导入，缺少录音时不借用另一内置课程。德语（2）仅收录所提供的 9 份原始 XLSX，缺少 E7/E8、例句及录音，不生成替代内容。

课程选择保存于本机，切换时清空搜索和星标筛选并加载该课程首份词表，保留学习模式、视图及已有星标。桌面导入沿用会话生命周期，新一批替换上一批导入文件，内置资源始终保留；Android 沿用原生持久导入。切换课程不删除或隐藏导入词表。桌面备份增加可选 `course`，Android 偏好增加 `course`；旧备份缺少课程时按德语（1）解释，非法课程在替换状态前拒绝。Android 每词表进度仍通过稳定键恢复。构建目录不入库。

浏览器版不包含原生更新、反馈发送器或来源配置。反馈打开 GitHub，更新通过替换离线包；不引入代理、后台服务或 Service Worker。静态网站方式需要访问服务器，离线保证由完整 ZIP 提供。桌面备份保留原 `GermanWords-Windows` 格式以兼容既有数据；浏览器与 WebView 存储相互隔离，通过备份迁移。

Android 与桌面保留各自界面与平台会话状态，不用通用控制器强行统一列表、音频播放器和 Android 备份流程。重复的解析、搜索、录音匹配、星标和语速规则则只在共享层维护。浏览器 Blob URL 的创建/释放由客户端负责，原生播放器的生命周期由 Java 宿主负责。

各端学习进度条使用原生 range 控件，共用 `shared/progress.css`；事件处理留在各自界面层。`input` 更新卡片预览或定位列表，停止播放且不安排自动发音；`change` 提交最终位置，再按当前学习模式和发音设置播放。Android 预览不写学习偏好，松手后保存；卡片两侧的固定尺寸翻页键与中间滚动内容分栏，避免字号变化造成遮挡，滚动内容不移动按钮。

`shared/word-fit.js` 只处理卡片德语词形的单行字号适配，随文本和可用空间变化重新测量；空间不足时先允许冠词独占一行，再按需缩小词形字号。ResizeObserver 触发的测量延至下一帧，避免在观察器交付期间修改被观察高度。平台布局和中文、例句字号仍由各自样式控制。该脚本不读取学习状态、不触发发音。

各端备份使用 `MarkStore.readAll()` / `replaceAll()`，不直接读写星标存储键；这保证持久存储不可写时，备份与界面仍使用同一份会话数据。主题通过 `AppTheme.getMode()` 读取，语速通过 `Playback.getRate()` 读取。平台备份格式可分别保留，输入字段在改变状态前验证。

单单元词条保留旧 ID 和原有存储键；混合词条使用单元名和旧 ID 组成唯一 ID，并保留 `sourceBook` / `sourceRoot`。星标仍写回原单元；混合顺序和位置单独保存。读取全部成功且请求仍是最新时才切换词表，失败和过期读取不得覆盖当前学习状态。搜索词不持久化，无结果不得抹除已保存位置。

修改共享数据规则后运行 `pnpm --dir tests test`；修改任一界面还需跑浏览器回归或真机测试，入口见 `tests/README.md`。双端版本号在 `shared/app-config.json`，Gradle 和 Windows 打包脚本读取；versionCode 必须递增。发布 APK 使用 Release 构建并沿用历史升级证书；正式版名称不要求换签，确需更换签名时另行设计兼容迁移。Windows 分发 NSIS 安装包，内置 HTML、公共 JS/CSS 和词库。

双端按用户选择读取同一来源目录中的正式或测试索引，版本化安装包置于各自版本子目录；Android 使用 RSA 载荷与 APK 签名校验，Windows 使用 Tauri 官方格式与安装器签名。更新偏好属于平台适配：Android 保存在原生 SharedPreferences，Windows 保存在固定 WebView profile，均不进入学习数据或浏览器版。`tools/publish-update.py` 校验双端产物、上传并读回核对后最后发布索引；正式版同步两通道，旧 beta 入口继续兼容，维护端写链接不进入客户端。

意见反馈表单不接触平台 API，`mobile.js` / `desktop.js` 注入发送函数，并负责打开表单前关闭词库、暂停音频；原生 `FeedbackSender` / `feedback.rs` 负责基本设备元数据及单文件上传。Android 更新与反馈复用 `ServiceHttp` 的来源、重定向和响应大小限制；Windows 复用原生 HTTPS 客户端限制。只在用户提交时发送，不读取学习存储。Android 反馈队列独立于导入/备份队列，均随 Activity 关闭；Windows 事件在脚本中绑定，避免违反 CSP。Windows 显示版本由构建工具从公共配置注入，源码页面不重复维护版本号。客户端只包含只读更新入口与仅上传反馈入口，二者不包含维护者写权限。数据格式见 [更新协议](updates.md)，签名备份、迁移及发布操作见 [维护要求](requirements.md)。
