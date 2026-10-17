# 云盘更新与维护

下载来源仍为 [当前清华云盘](https://cloud.tsinghua.edu.cn/d/361a8eccb1624c65ae26/)，维护者通过既有上传入口上传。没有自建服务器、网盘登录会话或运行时上传凭据。

## 当前入口

| 客户端 | 固定更新信息 | 安装方式 |
| --- | --- | --- |
| Android / 旧 Windows 原型 | `update-beta.json`，原有 RSA envelope | Android 系统 PackageInstaller；旧 Windows 原型保留原 ZIP 更新器 |
| 新 Windows 桌面版 | `update-windows-beta.json`，Tauri 官方格式 | 已签署更新签名的 NSIS 安装包，由官方更新插件执行 |

`shared/app-config.json` 唯一维护源码版本和云盘来源；Windows 的独立元数据路径、公钥位于 `windowsUpdater`。两个入口由同一维护工具发布，平台安装协议不强行统一。新桌面测试发布没有修改旧更新信息或 Android 安装包。

当前发布版本为 **4.2.0-beta.5**（Android versionCode 10），双端安装包和更新入口同步发布，源码已合并 main。GitHub 发布与更新通道使用同版本的签名安装包，旧原型兼容 ZIP 同步维护。

## 用户流程

两端启动后后台检查，每天至多一次；手动检查不受此限制，断网不影响学习。发现更新后先展示说明、询问是否下载。清华云盘仍只存放更新信息与版本化完整包，不加载远程学习页面。

- Android 下载前验证 RSA 元数据签名，下载后核对 SHA-256、大小、包名、版本和应用签名；首次安装来源授权及最终安装由用户在系统界面确认。
- 新 Windows 通过原生插件获取信息与下载，保留 User-Agent、HTTPS 和缓存规避；下载源限制在既有云盘，官方更新器验证签名后关闭应用、运行安装器并自动重启。用户数据与程序安装文件分开，升级不依赖外部浏览器或当前文件夹。
- 旧 Windows HTML 版首次转为桌面程序需运行新 Setup.exe。旧浏览器数据不能直接被新 WebView2 读取，使用迁移 ZIP 在原文件地址导出，再导入桌面版；步骤见 [Windows 说明](../apps/windows/README.md)。

## 发布 Windows 桌面版

构建前确保版本递增，并把 Tauri 签名私钥保存在仓库外。本机私钥为维护者用户目录 `.germanwords/tauri-update.key`；公钥随客户端分发。运行：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = '<私钥路径>'
pnpm --dir apps/windows build
python tools/publish-update.py publish-windows --installer "x86_64=<生成的setup.exe路径>" --upload-url <上传链接> --notes "更新说明"
```

安装包旁必须保留构建生成的同名 `.sig`；发布器把签名内容写入 Tauri 元数据，支持重复传入 `--installer "aarch64=<路径>"`。同一版本应一次列出全部发布架构，避免覆盖元数据时漏掉其他架构。当前实际只发布并验证 x64。

工具先上传所有包并从公开下载入口读回校验，最后覆盖元数据；版本化包若已存在但内容不同则拒绝覆盖。`--extra` 可上传起始测试包。不存在文件时云盘可能返回 HTML，因此上传器通过公开目录列表判断重名，不把 HTML 当成已发布安装包。

上传前必须通过产物校验：Windows 调用官方 Minisign（PATH 或 `MINISIGN`）验证签名及其绑定的版本/架构；Android 调用 SDK `aapt` / `apksigner` 核对实际版本、包名、公开证书指纹与嵌入配置；兼容 ZIP 也检查内嵌配置。工具缺失或任一输入错误时不上传，不允许仅靠改文件名发布旧包。SDK 在 APK 所在目录执行并只接收文件名，避免 Windows 工具对中文绝对路径的兼容限制。

## Android 与旧 Windows 兼容发布

保留原 RSA 工具和公钥，不影响已安装测试客户端：构建并签署对应版本的 Android Release APK，执行 `python tools/publish-update.py package --apk <已签名APK>`，再执行原 `publish --key <RSA私钥> --upload-url <上传链接> --notes "说明"`。

该 package 命令生成 APK 和供旧 Windows 更新器使用的兼容 ZIP；ZIP 使用原 `De_words_helper.html` 文件名与公共配置，不包含桌面安装器或重复的更新实现。覆盖更新会保留用户原有 `.cmd` / `.ps1`；它不是面向新用户的 Windows 桌面安装包。Android 输入 APK 必须是同版本、与现有应用同签名的 Release 构建。RSA 签名依赖 `tools/requirements-updates.txt`，仅维护端需要。

## 签名与边界

两端下载均限制 HTTPS、指定来源域名和重定向次数。Windows 通过官方更新插件的客户端配置实施，不另写下载器。Android 待授权的缓存状态持久化，恢复时重新校验文件；临时下载使用独立文件，已关闭宿主不再保存新待安装状态。

Tauri 更新签名、Windows Authenticode 签名、Android APK 签名和 RSA 元数据签名各有用途，不能互相替代。当前桌面测试包尚未配置正式 Authenticode 签名；Android beta 沿用历史开发证书。丢失更新私钥后，需要手动分发带新公钥的客户端；上传链接或私钥泄露应更换。更新器按元数据版本仅提示更高版本，签名本身不保证云盘长期可用。

保持 GitHub Releases 作为独立发布记录和原始包来源。WebView2 缺失、ARM64、长期云盘限流和所有旧系统的适配范围以实际验证记录为准，不能据一次更新测试作保证。

历史原型验证见 [云盘原型记录](../artifacts/cloud-update-verification.md)，本轮见 [桌面验证](../artifacts/windows-desktop-verification.md)。
