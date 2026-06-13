# Win11 文件资源管理器 · 视觉保真度目标规格（§11 自主部分）

> 用途：在无法自动截图比对的约束下，本文档把每个 UI 区域对齐到 Win11/Fluent 公开
> 设计令牌，作为 §11"零偏差"比对的目标基准。用户做真机截图比对时，逐区域核对下表。

## 全局令牌（Segoe UI Variable / Fluent）

| 令牌 | 浅色 | 深色 | WinFinder 当前 (`win11.css`) |
|---|---|---|---|
| 字体 | Segoe UI Variable Text, 14px | 同 | `--font: "Segoe UI Variable","Segoe UI"...` ✅ |
| 默认强调色（系统） | `#0067C0` | `#60CDFF` | `--accent: #0067c0` / `#60cdff` ✅ |
| 文本 | `#1A1A1A`(`#202020` 用于标题) | `#FFFFFF` | `--text: #1a1a1a` / `#fff` ✅ |
| 次要文本 | `#6E6E6E` | `#C5C5C5`(约) | `--text-sub: #6e6e6e` / `#b0b0b0`（深色可调到 #c5c5c5） |
| 背景（客户端区） | `#F3F3F3` | `#202020` | `--bg` ✅ |
| 面板背景（导航/状态栏） | `#FBFBFB` | `#2B2B2B` | `--pane-bg` ✅ |
| 主视图背景 | `#FFFFFF` | `#2B2B2B` | `--main-bg` ✅ |
| 边框/分隔线 | `#E5E5E5` | `#3A3A3A`(Win11 约 `#2C2C2C`) | `--border: #e5e5e5` / `#3a3a3a` |
| 选中项背景 | `#CBE4F9`(强调色 10% 着色) | 强调色半透(`rgba(103,160,255,.18)`) | `--select-bg: #cfe4f7` / `#4a5b6e`（接近） |
| 悬停背景 | `#F6F6F6`/`#F0F0F0` | `#2F2F2F`/`#383838` | `--hover-bg` ✅ |
| 圆角（控件/卡片） | 4px / 6px | 同 | 按钮用 6px，符合 Fluent |
| 圆角（菜单/浮层） | 8px | 8px | `.flyout/.context-menu/.modal` 8px ✅ |

## 区域尺寸（100% DPI / 96dpi）

| 区域 | Win11 目标 | WinFinder 当前 |
|---|---|---|
| 标题栏（含标签）高度 | ~40px | `--titlebar-h: 40px` ✅ |
| 标签高 | ~32px | `.tab { height: 32px }` ✅ |
| 窗口按钮宽 × 高 | 46×40（关闭 hover 红 `#C42B1C`） | `.wc { width:46px; height:40px }` ✅；`.wc-close:hover #c42b1c` ✅ |
| 命令栏高度 | ~44px | 实现为 toolbar-row `--toolbar-h: 48px`（略高，可调到 44px） |
| 命令按钮 | ~36×36，图标 | `.cmd` 32px / 工具栏按钮 36×36 ✅ |
| 地址栏（面包屑）高 | 32px | `32px` ✅ |
| 搜索框高 | 32px | `32px` ✅ |
| 导航窗格宽 | ~240px（可拖） | `--navpane-w: 240px` ✅ |
| 详细信息行高 | 32px | `ROW_H = 32` ✅ |
| 详细信息列头高 | 32px | `32px` ✅ |
| 状态栏高 | ~28px | `--statusbar-h: 28px` ✅ |

## 交互态（§11.1 要求逐态比对）

- 默认 / hover / 选中 / 多选 / 禁用 / 键盘聚焦 / 拖拽悬停 —— WinFinder 已实现各态
  的背景/边框切换（hover→`--hover-bg`，selected→`--select-bg`，disabled→opacity .5）。
- 关闭按钮 hover：红 `#C42B1C` + 白前景 ✅。
- 列头排序激活：强调色 + ▲/▼ ✅。

## 豁免（§11.3）

- Mica/亚克力背景色调（依赖桌面壁纸，仅要求色调/明度匹配）。
- 字体抗锯齿 / ClearType 子像素渲染（WebView2 与系统渲染差异）。
- 窗口阴影 / 系统级窗口动画。

## 比对流程（用户执行）

1. 真机 Win11（23H2/24H2）+ WinFinder 各开同一 `Dataset/`（见 dataset/README.md）。
2. 100% 缩放、浅/深主题，逐区域截图并排比对（区域表见 phase1-checklist.md）。
3. 几何 ≤1px、颜色 ΔE≤2、字体/图标一致；偏差项回报，我将按本表目标修复 `win11.css`
   与对应组件，直至全绿。

## 自主完成的 §11 部分

- 设计令牌已按 Fluent 对齐（上表"当前"列）。
- 各交互态已实现。
- 本目标规格文档已产出（供比对）。
- **未完成**（结构性需用户）：真机 Win11 基准截图采集 + 逐区域并排比对判定 —— 这一步
  依赖用户的真实 Win11 与屏幕，无法自动化完成。
