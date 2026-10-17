# 云盘更新测试记录

日期：2026-10-17。开发分支 `codex/update-source-investigation`，未合并主分支、未创建 GitHub Release。

## 产物

下载来源为用户指定的清华云盘目录。上传入口支持匿名 multipart 上传及同名覆盖；用独立探针文件验证覆盖，没有修改原来的 `test.md`。上传凭据和签名私钥均不入库。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| GermanWords-Android-4.2.0-beta.1.apk | 4435098 | `5f02faf1798d1a6c5096936c5a9616cd0d3d48898e9275599485e19951ea055a` |
| GermanWords-Android-4.2.0-beta.2.apk | 4435098 | `37e18ba37dde3545da6384bf59f693faccf5e8e9d02b1f8b9624cf07d9a4b9de` |
| GermanWords-Windows-4.2.0-beta.1.zip | 3871142 | `7384190dc17900430ec01956be7a73b853bd599336158657d5a228a55a2bb2a2` |
| GermanWords-Windows-4.2.0-beta.2.zip | 3871142 | `612f5b36262d81374ccf3cbf863244d14c9e00eb137490838d4243aa2c21793e` |

两端起点 / 目标分别为 versionCode 6 / 7。包已全部上传，逐一从公开下载链接读回并校验；最后上传 RSA 签名的 `update-beta.json`。发布工具再次执行时验证并跳过相同的版本包，拒绝覆盖内容不同的已发布版本包。

## 已通过

- Windows PowerShell **5.1** 实际从云盘检查 beta.1，返回 `available:true`；在隔离安装目录下载并安装 beta.2，再次检查返回 `available:false`。额外用户文件保留，HTML 路径不变。测试使用显式 `-NonInteractive -NoLaunch`，正常启动仍询问用户。
- 修复云盘拒绝无 User-Agent 请求的问题，最终两端包均带应用 User-Agent。ZIP 内配置和更新脚本与最终源码一致。
- `tests/windows-updates.ps1`：真实生产函数覆盖签名篡改、错误通道、非法文件名、错误包哈希、ZIP 越界、包内版本不一致、写入失败回滚、正常安装、用户文件保留和过期更新请求不降级。测试不访问真实安装目录或网络。
- 公共 Node 测试全部通过：8 份词表、460 词和录音、解析/搜索/星标/学习引擎/主题/语速。
- Edge 浏览器回归通过：源码页面和 Windows 发布包均通过现有完整学习回归。
- Android `assembleDebug assembleRelease assembleDebugAndroidTest lintDebug` 通过；Lint 0 error、2 个既有 warning（API 33 的 XML 属性及启用本地 JavaScript）。
- APK 通过 apksigner 验证，Release 构建关闭调试，以历史开发签名签署。起始 beta.1 已通过 adb 覆盖安装到小米 14（Android 16）。

## 真机确认待完成

手机处于锁屏状态，已请求用户解锁并确认安装来源权限。尚未把 Android 的云盘下载→系统确认→升级成功记录为通过；不能用 adb 直接安装目标版本代替该验证。完整真机回归也须在解锁后运行。

## 测试边界

Windows 下载/校验/替换使用真实云盘与真实系统 PowerShell，弹窗确认没有自动点击。未测试断电恢复、所有旧 Windows / Android 版本、校外移动网络及长期云盘限流。更新为整包覆盖，不增加差分或常驻服务；网络失败不影响离线学习。
