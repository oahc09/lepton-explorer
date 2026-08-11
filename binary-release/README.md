# binary-release（发布产物）

本目录存放 **Lepton Explorer** 经过优化的原生二进制及安装包，由 `tauri build`（release 构建）生成，可直接分发，无需从源码重新编译。

## 版本

- **应用版本：1.1.2**
- 标识符（identifier）：`com.lepton.explorer`
- 产品名（productName）：`Lepton Explorer`
- 平台 / 架构：Windows / x64

## 目录内容

| 文件 | 说明 | 约大小 |
| --- | --- | --- |
| `lepton-explorer.exe` | 独立可执行文件（已打包前端资源，双击即可运行，无需安装） | ~12 MB |
| `msi/Lepton Explorer_1.1.2_x64_en-US.msi` | MSI 安装包（WiX 打包，支持标准 Windows 安装/卸载） | ~4.96 MB |
| `nsis/Lepton Explorer_1.1.2_x64-setup.exe` | NSIS 安装包（makensis 打包，体积小、安装引导友好） | ~3.23 MB |

> 文件名中的版本号（如 `1.0.0`）与下方构建配置保持一致。

## 构建方式（如何重新生成）

全部产物由一次发布构建生成：

```bash
# 前端依赖安装（可选，首次或依赖变更时）
pnpm install

# 发布构建：先 vite 打包前端，再 cargo --release 编译 Rust，
# 最后自动产出 MSI 与 NSIS 安装包
pnpm tauri build
```

构建输出位置：

- 原生二进制：`src-tauri/target/release/lepton-explorer.exe`
- MSI：`src-tauri/target/release/bundle/msi/*.msi`
- NSIS：`src-tauri/target/release/bundle/nsis/*-setup.exe`

构建完成后，将以上三个文件按本目录结构复制进来即可。

## 版本号定义位置

如需变更版本，请同步修改以下三处（保持一致）：

- `package.json` → `"version"`
- `src-tauri/Cargo.toml` → `[package] version`
- `src-tauri/tauri.conf.json` → `"version"`（决定安装包文件名与安装器显示版本）

## 本版本功能亮点（v1.1.0）

- 多视图浏览（详细信息 / 图标 / 列表 / 平铺 / 内容），含导航窗格、地址栏、搜索。
- 文件操作：复制、移动（带进度）、重命名、删除至回收站、新建、压缩 / 解压（zip）、缩略图。
- 右键「打开」默认调用系统对应软件（如图片用「照片」打开）；「打开方式」可手动选择程序。
- 右键菜单视口边界翻转：贴近屏幕底部 / 右侧时自动向上 / 向左完整弹出，不再被裁剪。
- ⚙ **设置界面**（地址栏按钮 / `Ctrl+,`）：主题（跟随系统 / 浅色 / 深色）、显示隐藏文件、显示扩展名、预览窗格、详细信息窗格、导航窗格宽度——设置即时生效并跨重启持久化。
- 设置 → **外观**：可修改窗口背景颜色（8 个预设色板 + 自定义取色器 + 重置），实时生效并持久化。
- 设置 → **关于**：显示应用名、运行时版本号与 GitHub 仓库链接（一键打开）。
- 设置 → **启动**：「开机自动启动」开关（默认关闭），通过注册表 `HKCU\...\Run` 实现，零额外依赖。
- 设置 → **更新**：可手动「检查更新」，发现新版本时展示更新说明与「下载并安装」按钮（带下载进度条）。
- **启动静默更新检查**：应用启动时自动比对 `latest.json`，有更新则在顶部显示提示横幅。
- 设置 → **排查 / 日志**：一键打开崩溃日志目录。

## 崩溃日志（排查异常）

应用内置崩溃日志，任何原生 panic、原生访问违规（access violation）或前端 JS 异常都会自动落盘，无需开控制台：

- **日志目录**：`%LOCALAPPDATA%\com.lepton.explorer\logs\`
  （即 `C:\Users\<你的用户名>\AppData\Local\com.lepton.explorer\logs\`）
- **原生崩溃（panic）**：`crash-<时间戳>.log`，含 panic 位置（文件:行号）、panic 信息与完整 backtrace。
- **原生故障（访问违规 / segfault）**：同样是 `crash-<时间戳>.log`，由**向量化异常处理器（VEH）**捕获——这类故障 Rust 的 panic hook 看不到，典型来源是右键「显示更多选项」里某个第三方 Shell 扩展崩溃。日志含异常码、异常地址与故障地址。
- **前端异常**：`frontend-<时间戳>.log`，由 `window.onerror` / `unhandledrejection` 捕获的 JS 错误（含堆栈）。

复现崩溃后，把对应时间点的日志文件发回即可定位问题。

- **良性控制异常不再误报（v1.1.1）**：某些第三方组件会抛出 `DBG_CONTROL_BREAK`（`0x40010006`，控制台 Ctrl+Break 信号，属 INFORMATIONAL 级别）这类**良性**的控制/调试异常，并非内存访问违规。v1.1.1 起，VEH 仅记录 **error 级别（0xC0000000 段）** 的真正故障（如访问违规 0xC0000005、非法指令、栈溢出、堆损坏等），对 0x40010006 等良性异常直接放行、不再生成虚假的崩溃日志。

- **一键打开**：设置 → **排查 / 日志** 分区有「打开日志目录」按钮，点击即跳转到上述 `logs` 文件夹（目录不存在时会自动创建）。

> 提示：release 构建开启了 `strip = true`，backtrace 可能为地址而非函数名；如需更可读的符号，可临时关闭 `src-tauri/Cargo.toml` 的 `[profile.release] strip` 后重新构建。

## 右键「显示更多选项」的健壮性

右键 →「显示更多选项」会调用 Windows Shell 经典上下文菜单（含第三方 Shell 扩展）。
为避免某个扩展崩溃时拖垮整个文件管理器，该菜单改在**独立子进程**中运行：

- 主程序 spawn 一个自身副本（带 `--lepton-shell-host` 参数）来托管菜单，子进程退出后主程序继续运行。
- 子进程会创建**自己的隐藏宿主窗口**作为菜单的 owner（`TrackPopupMenuEx` 必须由其同一线程的窗口担任 owner，否则弹窗会因跨进程 + 前台权限问题而完全不显示），并通过 `AttachThreadInput` 附加到前台线程、调用 `SetForegroundWindow` 取得输入焦点，确保菜单稳定弹出。
- 菜单命令改为 **异步** 执行（在 worker 线程上等待子进程），主程序主线程不再被阻塞，避免因父窗口线程冻结导致菜单无法显示。
- 坐标由前端以**屏幕像素**传入（在 webview 相对坐标上叠加窗口屏幕位置），子进程再按系统 DPI 缩放到物理像素，保证在高分屏上也出现在光标处。
- 若某个 Shell 扩展在子进程里触发访问违规，只会让子进程退出，主程序不崩溃；子进程的故障仍会被 VEH 写入上述 `logs` 目录。

因此「显示更多选项」不再能导致整个软件异常退出，且能稳定弹出。

> 菜单流程诊断日志：`%LOCALAPPDATA%\com.lepton.explorer\logs\shell-menu-trace.log`——子进程每一步（解析路径 / 绑定父文件夹 / 查询菜单 / 创建宿主窗口 / 弹出 / 命令 / 完成）都会追加记录。若菜单仍异常，把该文件与同目录的 `crash-*.log` 一起发回即可定位。

## v1.1.2 修正：「显示更多选项」点击后菜单无显示

v1.1.0/1.1.1 将经典菜单放进独立子进程以隔离崩溃，但子进程把**父进程窗口**当作 `TrackPopupMenuEx` 的 owner，而父进程主线程又在 `.status()` 上被阻塞——Windows 无法为「跨进程 + 被冻结的 owner 线程」建立弹窗，导致菜单**完全不显示**（既非崩溃也非报错）。v1.1.2 改为：子进程创建**自身隐藏宿主窗口**作为 owner、`AttachThreadInput` 附加前台线程并 `SetForegroundWindow` 取得焦点、命令改为异步避免阻塞父线程、坐标按屏幕像素 + DPI 缩放传入。并新增 `shell-menu-trace.log` 便于后续排查。

## v1.1.1 修正：崩溃日志误报良性控制异常

v1.1.0 的 VEH 会记录**每一次**原生异常，包括某些 Shell 扩展抛出的良性 `DBG_CONTROL_BREAK`（`0x40010006`）。该异常并非内存故障，却被写成「NATIVE fault」日志，造成误报。v1.1.1 修正为：仅当异常属于 **error 级别（高两位为 0b11，即 0xC0000000 段）** 时才记录，并显式放行 `0x40010005`（Ctrl+C）、`0x40010006`（Ctrl+Break）、`0x406D1388`（VC++ 线程命名）等已知良性码。真正的访问违规（0xC0000005）等仍会正常落盘。

## 软件更新（自动检查 / 下载 / 安装）

采用**自托管清单**方案：仓库根目录的 [`latest.json`](../../latest.json) 描述最新版本（版本号 / 更新说明 / 下载链接 / 发布日期），应用通过 `raw.githubusercontent.com` 拉取该文件并与当前版本（`CARGO_PKG_VERSION`）比对，无需签名服务器或额外基础设施。

- **启动静默检查**：应用启动时自动检查；若有新版本，在窗口顶部显示提示横幅（「查看」打开设置，「稍后」本次不再提示）。离线或清单不可达时静默跳过，不影响正常使用。
- **手动检查**：设置 → **更新** →「检查更新」按钮（打开设置时也会自动检查一次）。
- **下载并安装**：发现新版本后点击「下载并安装」，安装包下载到缓存目录（`%LOCALAPPDATA%\..\..\..\Temp\lepton-explorer\updates\` 或系统缓存下 `lepton-explorer/updates/`，固定名 `lepton-explorer-setup.exe`），UI 实时显示下载进度；下载完成后自动启动 NSIS 安装程序并退出当前进程，由安装程序完成原地升级。

> 发布新版本流程：① 提升 `src-tauri/Cargo.toml` 与 `src-tauri/tauri.conf.json` 的版本号；② 重新出包并把 `binary-release/nsis/`、`msi/`、`lepton-explorer.exe` 三件套更新；③ 更新仓库根目录 `latest.json` 的 `version` 与 `download_url`（指向新的 NSIS 安装包 raw 链接）。已发布的旧版本用户将在下次启动时被提示更新。

## 说明

- 这些二进制为**发布（release / optimized）**构建，已内联前端资源与图标。
- 本目录下的文件为构建产物，建议通过上面的命令重新生成，而非手动编辑。
- 出于体积考虑，重新构建前可清理 `src-tauri/target/release/` 下的旧产物。
