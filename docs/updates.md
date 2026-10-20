# 更新与发布维护

## 目录与权限

维护端使用开发者可写目录分享链接（通过 `GERMANWORDS_RELEASE_UPLOAD_URL` 或 `--upload-url` 传入，不打包进客户端）。客户端只使用 `shared/app-config.json` 中的只读分享链接。两者必须指向同一个 Release 目录；反馈使用另一个仅上传入口，与发布权限分开；其实际目标目录由 `feedbackUploadPath` 与链接配套维护，不能把分享目录当成存储根目录 `/`。

每个版本独占一个子目录，根目录只有一个当前通道的更新索引：

```text
Release/
  update-beta.json
  4.2.1-beta.3/
    GermanWords-Android-4.2.1-beta.3.apk
    GermanWords-Windows-4.2.1-beta.3-x86_64-Setup.exe
    GermanWords-Windows-4.2.1-beta.3-x86_64-Setup.exe.sig
    GermanWords-Web-4.2.1-beta.3.zip
    SHA256SUMS.txt
```

当前发布版本为 `4.2.1-beta.3`（Android versionCode 13）。`update-beta.json` 同时包含 Tauri 官方需要的 `version` / `notes` / `platforms` 和 Android 的 RSA `payload` / `signature`。Android 签名载荷内的安装包路径必须严格对应版本子目录和文件名；Windows 平台项使用只读分享下该子目录的下载 URL，并携带官方安装包签名。无需自建服务器，也不统一两种安装协议。

版本、通道、来源与公钥唯一维护于 `shared/app-config.json`。更换来源只能影响新构建；已安装旧版仍读取旧地址，需要手动安装新包，或在原入口另行安排迁移。本工具不修改原入口，也不继续维护 HTML 原型的更新包；旧版迁移导出工具仍由构建脚本生成。

## 客户端行为

Android 与 Windows 启动时后台检查，每天至多成功检查一次；手动检查不受此限制。无网络或服务异常不影响学习。发现更高版本后先展示更新说明，由用户确认下载。

- Android 验证 RSA 元数据签名，下载后核对 SHA-256、大小、包名、版本和应用签名，再交给系统 PackageInstaller。待授权缓存持久化，恢复时重新校验；取消会清理。
- Windows 使用 Tauri 官方更新插件，验证安装包签名后关闭应用并运行 NSIS 安装器。学习数据位于独立用户目录。
- 下载与反馈请求只允许指定来源主机的 HTTPS 默认端口；GET 重定向有次数限制，反馈 POST 不重放。学习 WebView 的资源访问和导航仍限于本地。
- 客户端使用“检查更新”“下载更新”“意见反馈”等通用措辞，错误提示不输出服务商、URL、令牌或网络异常详情。

浏览器版不读取原生更新索引、不调用安装器或原生反馈发送器。「下载新版」打开 GitHub 发布页，用户导出备份后替换完整 ZIP；静态托管由维护者替换全部文件。浏览器 ZIP 用 `python tools/build-web.py` 构建，可作为 `--extra` 附件与安装包放在同一版本目录，保留现有双端签名索引格式。

## 构建与发布

先递增 `versionName` / `versionCode`，构建同版本 APK 与全部 Windows 架构安装包。私钥保存在仓库外。

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = '<Tauri 私钥路径>'
pnpm --dir apps/windows build
# Android Release APK 另行构建并以支持的升级证书签名
$env:GERMANWORDS_RELEASE_UPLOAD_URL = '<开发者可写目录分享链接>'
python tools/publish-update.py publish --apk '<已签名APK>' --installer 'x86_64=<Setup.exe>' --key '<RSA私钥PEM>' --directory 'output/releases/prepared' --notes '更新说明' --extra '<SHA256SUMS.txt>' --prepare-only
```

`--prepare-only` 只在本地校验并生成索引；检查无误后去掉此参数才上传。同一版本一次列出所有已分发架构，可重复传入 `--installer 'aarch64=<Setup.exe>'`。APK、安装包与同名 `.sig` 都是必需输入。

发布前核对：APK 包名、真实版本、非调试属性、证书指纹和嵌入配置；Windows 调用官方 Minisign 验证安装包及签名注释绑定的版本/架构；RSA 私钥必须匹配客户端公钥。依赖见 `tools/requirements-updates.txt`，Minisign 由 PATH 或 `MINISIGN` 指定。APK 不得为空或超过 Android 的 32 MiB 接收上限；索引不得超过 Android 的 64 KiB 读取上限，超限会在上传前拒绝。Android SDK 由 PATH / `ANDROID_HOME` 定位，SDK 命令在包目录运行，避免中文绝对路径兼容问题。

发布器通过目录上传 API 的 `relative_path` 创建版本子目录，从客户端只读入口读回并核对每个文件，最后才替换根目录索引。同名版本包若内容不同则拒绝发布，应递增版本；失败不会继续发布索引，已经传完的版本文件可在重试时复用。`--extra` 附件也放在版本目录，不可与索引或安装包重名。GitHub 发布仍由维护者另行执行。

## 意见反馈

用户从“词库与设置 → 意见反馈”填写 1～4000 字内容，点击提交才联网。失败保留文字，可再次提交；不自动采集日志或发送学习状态。

每次提交一个 UTF-8 JSON：`schema: 1`、`submittedAtUnixMs`（UTC Unix 毫秒）、`message`、`app`、`device`。应用字段包括平台、版本、versionCode 和通道；设备字段包括操作系统、架构和 WebView User-Agent，Android 额外包含系统版本、SDK 及厂商/型号。Windows User-Agent 中的系统信息不用于精确区分 Windows 10/11。不包含用户名、设备唯一标识、文件路径、词库、星标或备份。

关闭窗口不撤回已经提交的上传任务。反馈网络任务与本地导入任务使用独立执行队列，网络等待不会阻塞导入。

公共表单位于 `shared/feedback.js` / `.css`，通过注入发送函数接入平台。Android 的 `FeedbackSender` 与 Windows 的 `feedback.rs` 生成元数据并上传；Android `ServiceHttp` 供更新和反馈共用，Windows 复用原生 HTTPS 来源限制。测试代码保持在测试目录。

仅上传链接需要随客户端分发，能够从安装包中提取；隐藏界面中的后端名称不等于保密或反滥用。反馈上传入口必须与维护端可写发布链接隔离，服务端容量与入口更换由维护者管理。

## 签名与发布边界

Tauri 更新签名、Windows Authenticode、Android APK 签名和 RSA 元数据签名不可互相替代。当前 beta 沿用历史 Android 开发证书，Windows 尚未配置 Authenticode。丢失私钥需要手动分发带新公钥的客户端；发布写权限或私钥泄露时应更换。

新目录为空时，客户端手动检查会提示暂时无法检查；不能把没有索引当作“已是最新”。需要一次正常发布后才具有可用更新源。维护工具的离线回归不会写入远端，真实更新安装仍需单独验证。
