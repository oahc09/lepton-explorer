# Lepton Explorer — 实施记录（分阶段计划合并版）

> 本文档由原 6 份分阶段实现计划（phase0-foundation、phase1a~1e）压缩合并而成，保留各阶段
> **目标、关键交付物与架构决策**，删除逐任务的步骤细节。设计规范见 `../design.md`，验收见
> `../acceptance/README.md`，性能见 `../performance.md`。

## 总体架构

- **后端（Rust / Tauri v2）**：每个文件系统操作封装为类型化 Tauri 命令；前端绝不直接碰磁盘。
  模块：`fs_ops`（列目录/元数据/创建/重命名/复制/移动/删除/打开/冲突策略/进度）、`watch`
  （notify 实时监听）、`thumbnails`（系统级缩略图 + LRU 磁盘缓存）、`shell_icons`
  （SHGetFileInfo 文件类型图标）、`special`（特殊文件夹/盘符/回收站）、`search`（递归通配）、
  `open_with`（注册表枚举）、`zip`（压缩/解压，Zip-Slip 防护）、`folder_views`（按文件夹记忆视图）、
  `shell_menu`（真实 IContextMenu）、`office`（docx/xlsx/pptx 类型化）、`error`（AppError）。
- **前端（React + TypeScript）**：Zustand 状态（`locationStore` 标签页历史、`viewStore` 视图/排序/列宽、
  `selectionStore`、`clipboardStore`、`historyStore` 撤销重做、`searchStore`、`pinnedStore`、
  `recentStore`、`tagStore`、`conflictStore`、`progressStore`）；`hooks/`（useDirectory、useFileOps）；
  组件：TitleBar / TabBar / Toolbar / Breadcrumb / NavPane / CommandBar / FileList + 8 视图 /
  ContextMenu / OpenWithDialog / PropertiesDialog / PreviewPane / ProgressModal / ConflictModal。
- **数据契约**：camelCase（由回归测试锁定）；长任务发 `fs-*-progress` 事件驱动共享可取消进度对话框。

## Phase 0 — 基础纵切（Foundation）

**目标**：打通 Tauri v2 + React 骨架，能列目录、导航、8 视图抽象验证、Win11 主题/Mica。

关键交付：
- 脚手架 + 依赖（Tauri v2、React、TS、Zustand、@tanstack/react-virtual）。
- Rust `Entry` 模型 + `list_directory`（并行列目录）、`special_folders`、`list_drives`、`AppError` 与命令接线。
- 前端类型 + Vitest 测试基建；`locationStore`（路径 + 后退/前进/向上）、`viewStore`（视图+排序）、
  `useDirectory`（mock invoke TDD）、`selectionStore` + Details 视图。
- 导航：Breadcrumb（段点击/同级下拉/编辑模式）、NavPane（此电脑树）、Toolbar（后退/前进/向上/刷新）。
- App 外壳布局 + StatusBar + 启动到默认文件夹；自定义 TitleBar（Mica + 窗口按钮 + 深/浅主题）。
- Large icons 视图（验证视图抽象）；Win11 主题（Segoe UI Variable 字体 + 双色板 + Mica 打磨）。

## Phase 1a — 视图层（View Layer）

**目标**：补齐剩余 7 种视图与选择/排序交互。

- 图标尺寸档位 + FileList 分发 + 视图切换器 + `Ctrl+Shift+1–8`。
- ListView、TilesView、ContentView。
- 选择增强：Ctrl+A、方向键焦点移动 + 自动滚动。
- Details 列头排序指示（▲/▼）。

## Phase 1b — 变更层（Mutation Layer）

**目标**：文件写操作、剪贴板、撤销重做、命令栏接线。

- Rust：`create_dir`/`create_file`/`rename`/`open`；`copy_items`/`move_items`（跨卷=复制后删源、
  同卷原子重命名、冲突自动重命名）；`delete_to_trash`/`delete_permanent`。
- 前端：`clipboardStore`（复制/剪切）、`historyStore`（撤销/重做栈）、`useFileOps`（执行 + 撤销接线）。
- CommandBar + 快捷键 + 双击打开 + App 接线；构建 exe 并验证运行。

## Phase 1c — 丰富度层（Richness）

**目标**：实时监听、缩略图、系统图标、右键菜单。

- `watch`（notify，去抖后发 `fs-changed`）。
- 图片缩略图（`image` crate，按 path+mtime+size 缓存）；文件类型图标（HICON→PNG）+ emoji 回退。
- 前端 Thumbnail 组件；自研 Win11 现代右键上下文菜单。

## Phase 1d — 导航/信息层（Nav & Info）

**目标**：搜索、属性、行内重命名、主页，收尾 Phase 1 发布。

- Rust `search`（当前目录+子目录递归通配，流式返回）+ `folder_size` 聚合。
- 前端 search store + SearchBox + 结果路由；PropertiesDialog（Alt+Enter）；F2 行内重命名；Home 主页
  （特殊文件夹卡片 + 最近文件）。交付 Release exe + §11 就绪。

## Phase 1e — 打磨收尾（Polish）

- F11 全屏 + Shift+F10 上下文菜单；Details 列宽拖拽；Win11 命令栏 View/Sort 浮层；
  补充测试；Release exe + 终报。

## 续做（Phase 2/3 特性已落地）

原始规格将标签页、多窗口、预览/详情窗格、拖放、ZIP、真实 Shell 菜单、Gallery、OneDrive、网络、
视图持久化、打开方式等列为 Phase 2/3。实际开发中均已实现，要点：

- 多标签（独立历史、拖拽重排、中键、Ctrl+1–9）+ 多窗口（Ctrl+N，末标签关窗口退出）。
- 拖放移动/复制 + 拖放高亮 + 同名冲突/进度（与粘贴一致）。
- ZIP 压缩/解压（可取消、Zip-Slip 防护、目标名自动编号）。
- "打开方式"对话框（注册表枚举 + 系统原生选择器）。
- 按文件夹记忆视图（模式/排序/列宽持久化）。
- 预览窗格（Alt+P）/ 详情窗格（Alt+Shift+P）；Gallery/网络/OneDrive 根节点；
  真实 Shell `IContextMenu`（"显示更多选项"）。
- §11 视觉对齐到实测 Win11 值；复制/移动冲突对话框（替换/跳过/保留两者）；
  F6/Shift+F6 窗格焦点、Alt+←/→/↑ 导航、Ctrl+滚轮图标尺寸、可取消复制/移动进度（含中途取消/重做/拖放一致性）、
  Details 列显隐 + 分组依据。

## 测试与类型检查

```bash
cd src-tauri && cargo test --lib   # Rust 单元测试（59 passed, 9 ignored）
pnpm test                          # 前端测试（165 passed）
pnpm exec tsc --noEmit             # TypeScript 类型检查（0 errors）
```
