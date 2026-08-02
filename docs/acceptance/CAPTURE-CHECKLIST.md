# §11 视觉零偏差 · 截图采集清单（Capture Checklist）

本文件是「视觉零偏差打磨」阶段的操作手册。目标：在真机 Win11 与 Lepton Explorer 渲染**相同内容**，
逐区域并排比对，几何 ≤1px、颜色 ΔE≤2、字体/图标一致；偏差回报后由我修复 `win11.css` 与对应组件，直至全绿。

## 前置条件（双方一致）

- 缩放 **100%**（设置 → 显示 → 缩放；96 DPI）。
- 分辨率 **1080p+**，窗口**最大化**。
- 关闭**高对比度**模式。
- **浅色**与**深色**主题各采一套（设置 → 个性化 → 颜色 → 模式）。
- 同一份 `Dataset/`（见下）在真机 Win11 文件资源管理器 **和** Lepton Explorer 中各打开一次。

## 标准数据集 `Dataset/`

> 模板已放在 `docs/acceptance/dataset/Dataset/`，请复制到工作目录（如 `D:\Dataset`）并打开。
> 二进制文件可留空（图标按扩展名渲染，内容不影响布局比对）。

```
Dataset/
├── 子文件夹A/            (含 1 个 txt)
├── Pictures/             (含 2 张 jpg)
├── 文档.txt              ("hello")
├── 报告.pdf
├── 照片.jpg
└── 视频.mp4
```

## 采集区域矩阵（区域 × 状态 × 主题）

命名：`<app>-<区域>-<状态>-<主题>.png`
（`win11-` = 真机黄金基准；`winf-` = Lepton Explorer 自采；主题 `light`/`dark`）

| # | 区域 | 状态 | 主题 | 文件示例 |
|---|---|---|---|---|
| 1 | titlebar（Mica、标签、窗口按钮） | default | light/dark | `win11-titlebar-default-light.png` |
| 2 | titlebar | 关闭按钮 hover（红） | light | `win11-titlebar-close-hover-light.png` |
| 3 | toolbar（后退/前进/向上/刷新） | 全部启用 | light/dark | `win11-toolbar-default-light.png` |
| 4 | toolbar | 前进禁用 | light | `win11-toolbar-forward-disabled-light.png` |
| 5 | breadcrumb 地址栏 | 浏览态 | light/dark | `win11-breadcrumb-default-light.png` |
| 6 | breadcrumb 地址栏 | 编辑态（点击输入） | light | `win11-breadcrumb-edit-light.png` |
| 7 | nav-pane 导航窗格 | 展开"此电脑"+快速访问 | light/dark | `win11-navpane-default-light.png` |
| 8 | details 视图 | default（Dataset 文件夹） | light/dark | `win11-details-default-light.png` |
| 9 | details 视图 | 选中 1 项 | light | `win11-details-selected-light.png` |
| 10 | details 视图 | 多选（Shift 选 3 项） | light | `win11-details-multiselect-light.png` |
| 11 | details 视图 | 分组依据=类型 | light | `win11-details-grouped-light.png` |
| 12 | 大图标视图 | default | light/dark | `win11-icons-large-light.png` |
| 13 | 列表视图 | default | light | `win11-list-light.png` |
| 14 | 平铺视图 | default | light | `win11-tiles-light.png` |
| 15 | 内容视图 | default | light | `win11-content-light.png` |
| 16 | command-bar | default + View▾/Sort▾ 展开 | light/dark | `win11-commandbar-viewopen-light.png` |
| 17 | context-menu 右键菜单 | 文件上右键 | light/dark | `win11-contextmenu-light.png` |
| 18 | properties 属性对话框 | Alt+Enter | light | `win11-properties-light.png` |
| 19 | preview-pane 预览窗格 | Alt+P 选中图片 | light | `win11-preview-light.png` |
| 20 | details-pane 详情窗格 | Alt+Shift+P | light | `win11-detailspanel-light.png` |
| 21 | search 搜索下拉 | 输入关键字 | light | `win11-search-light.png` |
| 22 | home 主页 | 默认（含最近文件） | light/dark | `win11-home-light.png` |
| 23 | 多标签 | 2 个标签 | light | `win11-tabs-light.png` |
| 24 | 冲突弹窗 | 同名粘贴 | light | `win11-conflict-light.png` |
| 25 | 进度弹窗 | 复制进行中 | light | `win11-progress-light.png` |
| 26 | status-bar 状态栏 | 无选中 / 选中 N 项 | light/dark | `win11-statusbar-light.png` |
| 27 | 拖放高亮 | 拖文件悬停文件夹 | light | `win11-dragover-light.png` |

> 至少覆盖 #1–#16、#26（Phase 0+1 核心）。其余按需补充。

## Lepton Explorer 自采步骤

```bash
pnpm install
pnpm tauri dev          # 启动 Lepton Explorer
# 打开 Dataset/，按上表逐区域截图，存为 winf-<区域>-<状态>-<主题>.png
```

> 注意：自采工具（html2canvas）不支持 CSS-grid `minmax` 轨道，details 列头/列宽
> 无法被自动化截图代表；真机 `tauri dev` + 系统截图工具可正常捕获。

## 交付与比对

1. 把 `win11-*.png`（黄金基准）与 `winf-*.png`（自采）放入 `docs/acceptance/compare/`。
2. 我会逐区域并排比对，输出偏差表（几何/ΔE/字体），并修复 `win11.css` 与相关组件。
3. 反复至全绿。豁免项（Mica 色调、ClearType、窗口阴影）仅要求色调/明度匹配。
