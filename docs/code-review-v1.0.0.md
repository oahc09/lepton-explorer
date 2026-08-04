# Lepton Explorer v1.0.0 代码审查报告

- **审查范围**：`ade02e7`（首个提交）→ `a5148aa`（v1.0.0），全量源码现状
- **审查重点**：安全 + 性能专项分析
- **结论**：**修复后可发布**（3 个必须修复项）

---

## 优点（已验证）

- **Zip-Slip 防护真实有效**：`zip.rs:154-162` 使用 `enclosed_name()` + 词法 `starts_with` 复核；对照 zip-2.4.2 crate 源码验证，可拦截 `..`、反斜杠 `..\`、绝对路径、盘符前缀、UNC、`\\?\` 及符号链接条目全部逃逸向量。Zip 符号链接按普通文件写入，无符号链接创建攻击。单测覆盖 `../escape.txt`（`zip.rs:272`）。
- **破坏性操作加固**：`ops.rs:17-63` 规范化路径后大小写不敏感地拦截系统目录；`delete_permanent` 先校验全部路径再删除任何文件（`ops.rs:522-530`），无部分删除；覆盖替换走回收站（`ops.rs:401`）。
- **无命令注入**：`open_in_terminal`（`ops.rs:534-547`）用 argv 形式 spawn 且有 `is_dir` 预检；`shell_execute`（`open_with.rs:315`）结构化传参、路径带引号。全库无 shell 字符串拼接。
- **注册表只读**：`open_with.rs:51` 使用 `KEY_READ`，所有路径（含错误路径）都关闭句柄。
- **unsafe 块健全**：`shell_menu.rs` 所有错误路径都释放两个 PIDL；`thumbnails.rs` 销毁 HICON/GDI 对象；COM 初始化/反初始化平衡（S_FALSE 也平衡，符合 MSDN）。
- **性能工程大体真实**：Details/Icons 虚拟化 + memo 行 + 自定义比较器、窄 zustand 选择器、双层有界缩略图缓存（后端 LRU 128 / 前端 200 个 Object-URL 带 evict 回收）、搜索防抖 250ms、视图持久化防抖 400ms、zip/copy 流式 `io::copy`。20ms/5000 条的目录列举声明可信（`DirEntry::metadata()` 在 Windows 复用枚举数据，无额外系统调用）。
- **CSP 存在且能力域收敛**：`core:default` + 显式窗口权限 + `opener:allow-open-path`；`capture_dom_png` 限定在 temp/app-data（`lib.rs:52-71`）。

---

## Critical（必须修复）

### 1. CSP 阻止了应用自身的缩略图 —— `tauri.conf.json:25`
`img-src 'self' data:` 缺少 `blob:`。`Thumbnail.tsx:62` 通过 `URL.createObjectURL(blob)` 渲染——即 `blob:` URL。Tauri v2 在生产构建中把配置的 CSP 作为响应头下发（`dist/index.html` 本身无 meta CSP），因此 **打包后的 MSI/NSIS 里所有图标/缩略图大概率全部裂图**，而开发环境正常。提交 `ee90cdd` 同时引入了 Object-URL 管线和严格 CSP，两者交互从未在生产构建验证过。
**修复**：`img-src 'self' data: blob:`，然后用真实生产包冒烟测试。

### 2. 复制/压缩任何含 junction 的目录树会整体失败 —— `ops.rs:221-229`、`zip.rs:49-57`
Rust std 的 `is_symlink()` 对 Windows 目录 junction 返回 `true`，junction 进入「按单元复制」分支，但对目录 junction 调 `fs::copy`/`File::open` 会失败，错误向上传播并**中断整个多文件操作**。真实系统中 junction 无处不在（每个用户配置文件都有 "Application Data"/"Cookies" 等 junction，很多 `node_modules` 也用），「复制 C:\Users\me」或开发项目 100% 失败。属于核心功能在常见场景下失效（失败安全，无数据损坏）。
**修复**：当 `is_symlink && is_dir`（用 `fs::metadata` 解析）时跳过并收集警告，或重建 reparse point；把单文件错误聚合进结果而非 `?` 中断整批。

### 3. Shift 点击范围选择在全部 5 个视图中失效
每个视图调用 `handleClick(ev, item, [], …)` 时传了**空的** `allInOrder`（`DetailsView.tsx:120`、`IconsView.tsx:68`、`ListView.tsx:39`、`TilesView.tsx:41`、`ContentView.tsx:40`）。`selectRange`（`selectionStore.ts:31`）对空数组 `indexOf` 得 `-1` → 提前返回。Shift 点击完全无效，只有 Ctrl 点击和键盘方向键可用。
**修复**：把排序后的条目列表传入 memo 化行组件并传给 `handleClick`；补回归测试（现有测试只覆盖点击和键盘路径）。

---

## Important（应当修复）

### 4. 所有命令都是同步的 → 跑在 Tauri 主线程上
按 Tauri v2 文档，非 async 命令在主线程执行。耗时无界的命令——对 `C:\` 递归 `search`、大目录树 `folder_size`、GB 级 `copy_with_progress`/`create_archive`/`extract_archive`、慢网络盘的 `list_directory`、全图解码的 `get_thumbnail`——会冻结整个窗口，并饿死它们自己发出的进度事件（`lib.rs:144-151`），进度条可能 0→100 跳变。
**修复**：重命令改为 `async fn`（或 `tauri::async_runtime::spawn_blocking` 包裹）。

### 5. `fs-changed` 零防抖 + 每事件全量重挂载
`watch.rs:23` 按原始 notify 事件逐个 emit；`App.tsx:184-187` 每事件递增 `refreshKey`，`App.tsx:432` 把 `key={path-refreshKey}` 放在 `<main>` 上——每个事件触发完整 `list_directory` 重取**和**整棵 DOM 重挂载（滚动/焦点丢失）。向被监听目录解压 200 个文件的 zip ≈ 200 次重取 + 200 次重挂载。
**修复**：watcher 内做 200–300ms 合并防抖；去掉 `key` 重挂载。

### 6. 目录 watcher 是全局单例 → 多窗口监听失效
`WatcherState`（`watch.rs:6`）是应用级单例，所有 `WebviewWindow` 共享。窗口 B 导航会替换窗口 A 的 watcher（`watch.rs:32-34`），A 静默停止刷新——与宣称的多窗口特性冲突。
**修复**：按窗口 label（`tauri::Window` 参数）用 `HashMap` 分别管理 watcher。

### 7. `delete_to_trash(_undoable)` 跳过了 `delete_permanent` 有的系统目录防护
`ops.rs:478-520` vs `522-530`，防御纵深不一致：前端可把 `C:\Windows\…` 送入回收站（ACL 多半会拦，但既然建了防护层就应统一）。`open_in_terminal` 也只校验 `is_dir` 未过 `validate_safe_path`。
**修复**：统一套用 `validate_destructive_path`。

### 8. `get_thumbnail` 先全图解码再缩放 —— `thumbnails.rs:156-170`
5000 万像素照片 ≈ 200MB RGBA 解码（且在主线程，见 #4）只为生成 200px 缩略图；滚动图片文件夹内存飙升。
**修复**：`ImageReader::into_dimensions()` 预检 + 解码时降采样，或对源尺寸设硬上限。

### 9. Zip 解压无解压总量配额 —— `zip.rs:165-175`
zip-bomb 可写满磁盘。
**修复**：复制循环中累计字节数，加上限（如可配置默认 10GB）。

---

## Minor（建议改进）

- **Open With 图标永不渲染**：`get_icon` 返回裸 base64，`OpenWithDialog.tsx:73` 直接作 `<img src>` 用，缺 `data:` 前缀或 blob 转换（`Thumbnail.tsx` 有正确转换）。
- **`list_directory` 遇到单个坏条目即中断整个列表**（`fs_ops.rs:25-27`），而 `search()` 用 `flatten()` 优雅降级。建议 skip-and-continue 对齐。
- **进度弹窗把移动误标为复制**：`useFileOps.ts:105` 移动时也开 `'copy'`（移动中显示"正在复制"）。
- **搜索竞态**：无请求 id 防护——慢的旧 `search` 可能后于新请求 resolve 并覆盖结果（`SearchBox.tsx:24-27`）。
- **`network.rs:61-64`**：`lpRemoteName` 为 null 时 `PCWSTR::from_raw(null).to_string()` 是 UB，加 `is_null()` 防护（RESOURCE_CONNECTED/DISK 场景罕见）。
- **`groupBy.ts` 含字面 NUL 字节**（约 offset 743，字符串字面量内）——git 将其判为二进制，破坏 diff/审查工具。改用 `'\0'`。
- **系统盘黑名单硬编码 `C:\`**（`ops.rs:33-44`）——漏掉装在其他盘的 Windows 或迁移过的 Program Files。应从 `%SystemDrive%`/`KNOWNFOLDERID` 派生。
- **Mutex `.unwrap()`**（`thumbnails.rs:23,29`）在 poisoning 时 panic——主线程命令崩溃。用 `unwrap_or_else(|e| e.into_inner())`。
- **无长路径（>260 字符）支持**——无 `\\?\` 前缀、无 `longPathAware` manifest。至少写入文档。
- **缩略图 IPC N+1**——已被虚拟化视口限制（好），但批量 `get_icons(paths)` 命令或 asset 协议可减少快速滚动时的 IPC 抖动。
- **`useSorted` 每次比较分配 2 个小写字符串**（`detailsHelpers.ts:17-22`）——万级目录应预计算排序键。
- **`Cargo.toml` 无 `[profile.release]` 调优**（无 `lto`、`strip`、`codegen-units=1`）；`capture_dom_png` 是开发自截图辅助命令却暴露在生产——用 `#[cfg(debug_assertions)]` 门控。

---

## 安全分析小结

**攻击面**：40+ 个接收路径/可执行文件名的 IPC 命令，但仅服务于本地打包前端，`script-src 'self'`、无远程内容、能力域收敛。核心残余信任假设：前端完全可信，因此 `open_with_path`（任意 exe）和 `delete_to_trash`（无防护）是从任何 XSS 可达的代码执行/删除原语——由严格 CSP 缓解。
**验证有效**：Zip-Slip 缓解（对照 crate 源码全向量核验）、注册表只读、argv 安全进程启动、COM/PIDL 清理、覆盖进回收站、`capture_dom_png` 限定。
**验证破损/不完整**：junction 处理（功能性问题，不可利用）、回收站防护缺失（一致性）、无 zip-bomb 配额、网络枚举一处理论空指针解引用。
**残余低风险**：解压目标目录中若存在**预先植入**的符号链接/junction，写入会被重定向到 `dest` 之外——需要本机先有写权限；在 `starts_with` 检查前对 `dest` 做规范化可封堵。

## 性能分析小结

实测声明（20ms/5k 列举、584 文件/s 复制、2.66µs 缓存命中）与代码一致——`DirEntry::metadata` 在 Windows 无系统调用、缓存真实有界、memo 化/虚拟化正确实现。**现实差距**：「响应式 UI」目标被三处削弱——无界工作的主线程同步命令（#4）、未防抖的 fs 事件 → 重取 → 重挂载管线（#5）、每缩略图全图解码（#8）。其余内存边界良好（有界缓存带回收、搜索有上限、所有 `useEffect` 的监听器清理无泄漏、watcher 单例导航不泄漏）。

---

## 修复优先级建议

**发布阻断级**（按序）：
1. `img-src` 加 `blob:` 并验证生产 MSI
2. junction 感知的 copy/zip + 单文件错误聚合
3. 修复 Shift 点击范围选择

**随后**：4) 重命令异步化；5) `fs-changed` 防抖 + 去 `<main key>` 重挂载；6) 按窗口 watcher；7) 统一破坏路径防护 + zip 配额；8) 缩略图解码期降采样 + 批量图标 IPC；9) release profile 调优、`cfg` 门控 `capture_dom_png`、修 NUL 字节。

---

## 总体评估

**v1.0.0 可否发布？修复后可发布（3 个必须修复项）。**

**理由**：安全架构确实扎实——Zip-Slip 声明经受住了逐项核验；但当前 CSP 配置极可能使生产构建中所有缩略图/图标裂图，另有两个常见路径 bug（junction 复制中断、Shift 选择失效）会在用户第一天使用时就触发核心交互失败。
