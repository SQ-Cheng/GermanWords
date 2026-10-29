# 维护与发布要求

本文是维护与发布的操作入口。代码分层见 [架构](architecture.md)，更新索引、网络及反馈协议见 [更新协议](updates.md)，测试命令与设备边界见 [测试说明](../tests/README.md)。版本唯一来源是 `shared/app-config.json`；最新公开版本以根 README 和 GitHub Releases 为准，不在本文重复维护版本常量。

## 必须保持的兼容性

- Android 包名与 Windows identifier 保持 `cn.study.germanwords`。普通升级不得改变用户数据目录、清除星标或导入文件。
- Android `versionCode` 在全部通道间统一递增，必须高于所有已分发版本；两端升级还要求版本名按语义版本递增。移除 `-beta` 后缀不代替递增 Android versionCode。切换通道只影响接收范围，不降级安装包。
- 发布版本仅使用 `X.Y.Z`（配置 channel=stable，GitHub 正式 Release）或 `X.Y.Z-beta.N`（channel=beta，GitHub Pre-release）。配置 channel 同时决定新安装的默认接收范围，已有用户选择保留。`manifestPaths` 必须保留正式入口 `/update-stable.json` 和历史测试入口 `/update-beta.json`；两者都通过既有只读分享目录分发，不以 GitHub Release 代替应用内更新。
- 公共资源只维护在 `shared/`。德语（1）的旧词表键和德语（2）的课程前缀不得随目录整理随意变化；用户导入词表全局可用，切换课程不改变其身份、星标或存储生命周期。
- 备份格式变更保持旧格式可读，先校验再应用。学习页面不加载远程代码，平台安装、导入和播放器不进入公共数据层。

## 签名材料与备份

以下三类签名不可互相替代，必须同时保留对应私钥：

| 用途 | 维护机工作副本约定 | 公开校验依据 |
| --- | --- | --- |
| Android APK 升级身份 | `%USERPROFILE%\.germanwords\android-release.keystore`，沿用历史 `androiddebugkey` alias | `apps/android/release-certificate.sha256` |
| Android 更新信息 RSA 签名 | `%USERPROFILE%\.germanwords\update-signing-key.pem` | `shared/app-config.json` 的 `publicKey` |
| Windows Tauri 安装包更新签名 | `%USERPROFILE%\.germanwords\tauri-update.key`，另保留 `.pub` | `shared/app-config.json` 的 `windowsUpdater.publicKey` |

这些路径是本机维护约定，不是客户端读取路径。当前 Android 发行版沿用历史开发证书；固定发布副本与原 keystore 内容相同，没有生成新身份。**正式版必须继续使用兼容签名，不能直接生成“正式 keystore”替换它。** 日常协作者可以使用自己的调试签名，不需要取得发布私钥，但该调试包不能作为发行升级包。

Windows Authenticode 是另一套发布者签名，当前尚未配置；购买或更换 Authenticode 证书不能替代 Tauri 更新私钥，也不要求更换 Android 签名。

私钥、keystore、密码、维护端写链接和带凭据的本机配置不得入 Git、客户端安装包、浏览器 ZIP、日志或 GitHub 附件。仓库忽略常见密钥格式，但不能依赖忽略规则保护已被强制加入的文件。公钥和证书指纹可以入库，不得为让错误签名通过而修改它们。

备份要求：

1. 将三份私钥、Windows 公钥、对应 `app-config.json` 和 Android 证书指纹一起保存，附备份日期、源码提交、文件 SHA-256 和 Android alias；密码另存密码管理器或独立安全位置。
2. 备份目标位于仓库和构建目录之外，写入前限制访问权限；不覆盖已有的不同内容。复制后逐文件核对哈希。
3. 实际验证备份可恢复：Android 导出证书并比对指纹；RSA 签名测试载荷后用配置公钥验证；Tauri 签名测试文件后用官方 Minisign 和配置公钥验证。不要只检查文件存在，也不要重新生成密钥来代替恢复。
4. 至少保留一个离线或异机的加密副本，并定期验证。维护机另一盘符的副本只能防部分误删，不能代替整机损坏或失窃时的恢复。

2026-10-21 已核对三类身份并验证签名，维护机建立了受 NTFS 权限保护的 `E:\GermanWords-Signing-Backup\2026-10-21\` 副本，含六个材料文件和 `backup-manifest.json`。该副本仅授权当前维护用户及 SYSTEM；权限限制不是文件加密，不将其记为已完成离线/异机容灾。更换维护机时先从备份恢复和验证，再配置本机路径；不要把维护私钥发给普通协作者。

密钥丢失或泄露时先停止发布并核实影响。RSA/Tauri 新公钥无法由旧客户端凭空信任，可能需要兼容签名的手动安装包迁移；Android APK 私钥丢失尤其不能靠修改配置或公开指纹恢复原升级身份。换签或通道迁移必须单独设计、验证旧客户端的实际升级路径。

## 发布前检查

1. 在开发分支完成修改、审查和必要回归，再按授权合并。不要把未提交源码混进安装包；记录构建提交和准确的配置版本。
2. 确定正式版或 Beta 的版本名、跨通道递增 versionCode 和对应构建 channel；检查旧入口仍可匿名读取，当前架构均有安装包。首次发布正式版时创建 stable 入口并同步 beta；目录没有索引属于检查失败，不等于没有更新。
3. 在可用的最旧已支持版本上验证覆盖升级、数据保留和签名。源码回归、浏览器引擎测试不能冒充系统安装或其他操作系统真机测试；设备不可用时明确记录边界。
4. 修改公共数据规则至少执行 `pnpm --dir tests test`。修改界面运行对应浏览器/原生回归；Android 执行构建与 Lint。更新和发布工具执行 `python tests/test_updates.py`，配置官方 Minisign，确认签名集成测试没有被跳过。Rust 修改运行 fmt、test 和 clippy，具体入口见测试说明。

## 构建同一批附件

维护环境需要 Android SDK build-tools、JDK、Python 及 `tools/requirements-updates.txt`，Windows 构建另需 Node/pnpm、Rust MSVC 和 Visual Studio C++ 工具链。维护端另安装 [官方 Minisign](https://jedisct1.github.io/minisign/)，加入 PATH 或设置 `MINISIGN` 为其可执行文件路径，客户端不包含该工具。依赖版本以锁文件为准；SDK、Rust 和私钥位置只在本机配置。以下命令从仓库根目录运行。

先生成关闭调试且不含测试组件的 Android Release APK：

```powershell
Push-Location apps/android
.\gradlew.bat assembleRelease lintRelease
Pop-Location
```

当前 Gradle Release 产物为未签名包，需要显式使用固定发布 keystore 签名。将 Android SDK build-tools 加入 PATH 后执行；`$apk` 由维护者指定为待发布输出路径，其父目录应已创建。不要用 `assembleDebug` 代替，密码通过工具交互输入或安全环境变量提供，不写入命令历史。

```powershell
$signingDirectory = Join-Path $env:USERPROFILE '.germanwords'
apksigner sign --ks "$signingDirectory/android-release.keystore" --ks-key-alias androiddebugkey --out "$apk" apps/android/app/build/outputs/apk/release/app-release-unsigned.apk
apksigner verify --print-certs "$apk"
```

再构建 Windows 安装包与浏览器 ZIP。加载私钥密码时使用工具支持的安全本机方式；不要在共享终端输出环境变量或私钥。

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Join-Path $signingDirectory 'tauri-update.key'
pnpm --dir apps/windows build
python tools/build-web.py
```

Windows x64 NSIS 安装包及 `.sig` 位于 Cargo target 的 `release/bundle/nsis/`；浏览器 ZIP 位于 `output/web/`；旧 HTML 数据导出迁移包位于 `output/windows/GermanWords-Legacy-Migration.zip`。不要直接运行未传入生成版本配置的裸 `tauri build`，也不要把迁移包当作完整浏览器版。

只生成和分发本轮实际验证的架构；增加 ARM64 等架构需独立构建并实测，不能只在索引中增加一个地址。版本号或打包资源改变后重新构建全部受影响附件，不用重命名旧包伪造新版本。

## 预检、发布和读回

先在本地执行发布器预检，`$apk` 和 `$installer` 指向同一版本的最终签名产物，Windows `.sig` 必须位于安装包旁边：

```powershell
python tools/publish-update.py publish --apk "$apk" --installer "x86_64=$installer" --key "$signingDirectory/update-signing-key.pem" --directory "output/releases/prepared" --notes "本版更新说明" --prepare-only
```

同时发布多个已支持架构时重复提供 `--installer`，列出全部架构。完整浏览器 ZIP、迁移 ZIP 和 SHA256SUMS 可通过 `--extra` 附加；它们不替代 APK/安装包。预检不上传。

Beta 预检生成 `update-beta.json`；正式版预检生成 `update-stable.json` 与 `update-beta.json`。两份索引指向相同安装包、使用相同签名身份，但 Android 载荷分别标注 stable / beta。不要手改签名载荷，也不要把索引作为 `--extra` 传入。通道选择属于原生更新设置，浏览器 ZIP 仍通过发布页手动更新。

发布器必须通过以下检查，不能手改产物或关闭检查来绕过：

- APK 包名、真实 versionName/versionCode、非调试属性、历史签名证书和嵌入配置一致。
- Windows 官方 Minisign 验签成功，签名注释绑定正确版本与架构；RSA 私钥匹配客户端内置公钥。
- APK 不超过旧 Android 客户端的 **32 MiB** 上限，完整索引不超过 **64 KiB**。只放宽新代码不能改变旧客户端的限制。
- 同版本同路径文件内容不可变；若需更改已发布包，递增版本后重建。校验清单覆盖全部最终附件。

预检通过后，将同一批固定字节附件上传 GitHub 草稿，核对版本、大小、哈希和说明，再按该版本性质公开 Release 或 Pre-release。浏览器版只通过发布页下载新包，不读取原生更新索引。

更新目录另行同步：通过仓库外的 `GERMANWORDS_RELEASE_UPLOAD_URL` 或 `--upload-url` 提供维护端可写链接，使用相同参数去掉 `--prepare-only`，按需加入 `--extra`。客户端只读链接与维护端写链接必须对应同一发布目录，反馈上传权限保持独立。不要把写链接放进客户端或仓库。

工具先读取目标旧索引，拒绝版本或 versionCode 回退；正式版同步测试入口时，若已有更高测试版本则保留该入口。随后依次上传版本子目录内的安装包和附件，从客户端只读入口读回并校验，**最后才替换根目录索引**。安装包上传或校验失败时不提交索引；重试可复用已验证的相同文件，不能覆盖不同内容。两个入口分别上传和校验，若中途失败，重跑同一批产物完成同步。GitHub 发布和更新目录同步是两个独立结果，必须分别确认成功；仅发布 GitHub 不会触发应用内更新。

发布后再从公开入口确认本轮所有索引、对应架构地址、大小与 SHA-256；分别选择正式/测试接收范围，对已有版本运行手动检查，验证提示、签名、实际安装和数据保留。至少覆盖 beta → 更高 beta、beta → 同一基础版本的正式版、正式版拒绝 beta，以及从较高 beta 切回正式通道不降级。自动检查采用启动触发及各通道成功检查后 24 小时节流，切换通道立即检查，不是持续后台轮询；发现新版后需要用户确认下载和系统安装授权。测试辅助包、截图和本机配置不混入正式包。

## 防止升级链断开

- 旧客户端内置更新来源、索引路径、公钥及 Android 通道规则。改变仓库里的新配置不会改变已经安装的旧版本，也不要假设跨域重定向能绕过现有同源限制。
- 更换来源、通道、公钥、安装协议、大小上限或最低系统要求之前，先通过旧入口和兼容签名提供迁移版本，并保留旧入口供长期未升级用户取得它。不要很快用旧客户端无法接受的新包覆盖旧索引。
- 旧客户端固定读取 beta 入口，旧 Android 还要求载荷 channel=beta。正式版必须继续通过发布器同步 beta，不能把该入口删掉、直接改成 stable 载荷或只更新 GitHub。新客户端保存所选接收范围，安装正式版后仍可按原选择接收后续测试版。
- 发布错误时不要靠降低版本号或替换同名安装包修复；发布版本号更高的修复版，必要时用上一份正常源码重新构建。当前没有自动回滚器。
- 保留 GitHub 安装包、标签和必要的兼容迁移包作为手动恢复途径。手动 Android 覆盖安装仍需兼容签名；不要以卸载应用作为默认修复步骤，卸载可能丢失本地数据。

## 文档维护

`docs/` 仅保留当前架构、协议及本维护要求；使用和开发入口留在各端 README，测试入口留在 `tests/README.md`。已完成计划、首次调研、过期 issue 状态及阶段审查从当前目录移除，历史内容通过 Git 日志或对应发布标签查询；issue 当前状态以 GitHub 为准。

README 是稳定项目介绍，保留开发人员与致谢，附最新公开版本说明，不改成开发流水，不写私钥、维护端写权限或服务商细节。发布包与文档有差异时明确源码可能领先于发行版；不得把计划项目或模拟回归记作已完成真机验证。
