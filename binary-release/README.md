# binary-release（发布产物）

本目录存放 **Lepton Explorer** 经过优化的原生二进制及安装包，由 `tauri build`（release 构建）生成，可直接分发，无需从源码重新编译。

## 版本

- **应用版本：1.0.0**
- 标识符（identifier）：`com.lepton.explorer`
- 产品名（productName）：`Lepton Explorer`
- 平台 / 架构：Windows / x64

## 目录内容

| 文件 | 说明 | 约大小 |
| --- | --- | --- |
| `lepton-explorer.exe` | 独立可执行文件（已打包前端资源，双击即可运行，无需安装） | ~11 MB |
| `msi/Lepton Explorer_1.0.0_x64_en-US.msi` | MSI 安装包（WiX 打包，支持标准 Windows 安装/卸载） | ~4 MB |
| `nsis/Lepton Explorer_1.0.0_x64-setup.exe` | NSIS 安装包（makensis 打包，体积小、安装引导友好） | ~2.6 MB |

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

## 本版本功能亮点（v1.0.0）

- 多视图浏览（详细信息 / 图标 / 列表 / 平铺 / 内容），含导航窗格、地址栏、搜索。
- 文件操作：复制、移动（带进度）、重命名、删除至回收站、新建、压缩 / 解压（zip）、缩略图。
- 右键「打开」默认调用系统对应软件（如图片用「照片」打开）；「打开方式」可手动选择程序。
- 右键菜单视口边界翻转：贴近屏幕底部 / 右侧时自动向上 / 向左完整弹出，不再被裁剪。
- ⚙ **设置界面**（地址栏按钮 / `Ctrl+,`）：主题（跟随系统 / 浅色 / 深色）、显示隐藏文件、显示扩展名、预览窗格、详细信息窗格、导航窗格宽度——设置即时生效并跨重启持久化。
- 设置 → **外观**：可修改窗口背景颜色（8 个预设色板 + 自定义取色器 + 重置），实时生效并持久化。
- 设置 → **关于**：显示应用名、运行时版本号与 GitHub 仓库链接（一键打开）。
- 设置 → **启动**：「开机自动启动」开关（默认关闭），通过注册表 `HKCU\...\Run` 实现，零额外依赖。

## 崩溃日志（排查异常）

应用内置崩溃日志，任何原生 panic 或前端 JS 异常都会自动落盘，无需开控制台：

- **日志目录**：`%LOCALAPPDATA%\com.lepton.explorer\logs\`
  （即 `C:\Users\<你的用户名>\AppData\Local\com.lepton.explorer\logs\`）
- **原生崩溃**：`crash-<时间戳>.log`，含 panic 位置（文件:行号）、panic 信息与完整 backtrace。
- **前端异常**：`frontend-<时间戳>.log`，由 `window.onerror` / `unhandledrejection` 捕获的 JS 错误（含堆栈）。

复现崩溃后，把对应时间点的日志文件发回即可定位问题。

> 提示：release 构建开启了 `strip = true`，backtrace 可能为地址而非函数名；如需更可读的符号，可临时关闭 `src-tauri/Cargo.toml` 的 `[profile.release] strip` 后重新构建。

## 说明

- 这些二进制为**发布（release / optimized）**构建，已内联前端资源与图标。
- 本目录下的文件为构建产物，建议通过上面的命令重新生成，而非手动编辑。
- 出于体积考虑，重新构建前可清理 `src-tauri/target/release/` 下的旧产物。
