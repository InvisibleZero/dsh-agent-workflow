# 开发手册（dsh-agent-workflow）

> **用法**：每次开发踩到「宿主行为与直觉不符」的坑，就在第 4 节追加一条，编号连续、不删旧条。
> 每条写清 **现象 / 根因 / 正确做法 / 怎么验证**，只写可复现的事实，不写猜测。
> 当前对照的 DSH 版本：`0.2.2-rc.1`（桌面版）。

---

## 1. 构建与运行（本机命令）

```powershell
# 本机没有全局 node/npm，用 DSH 自带的：
$node='C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm='C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'

# 构建前把 node 放进 PATH（build 脚本里会调用 node / tsc）
$env:PATH='C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;'+$env:PATH

& $node $pnpm run build     # tsc 宿主 → esbuild 单文件 → tsc 客户端 → 打客户端包
& $node $pnpm run smoke     # 客户端冒烟：能否注册 sidebar.workspaces
```

- 插件以**目录链接**方式装在 profile：`~/.dsh/profiles/desktop/node_modules/dsh-agent-workflow -> 本目录`。
- **客户端改动**：必须让页面**硬刷新**（Ctrl+Shift+R）才加载新包；普通刷新可能命中缓存。
- **宿主改动**：`dist/host.js` 重建后要重启插件半才生效（`plugin_manager set_plugin` 关→开，或重启应用）。
- `dist/` 已提交进仓库，改源码后必须重新 `build` 并提交，否则仓库产物与源码不一致。

---

## 2. 已验证的宿主契约（速查）

| 用途 | 做法 |
| --- | --- |
| 替换侧栏浏览器 | 注册 `sidebar.workspaces`（single 槽），`priority: -1` 压过宿主 `0` |
| 子槽 | 必须由**正在渲染的这份注册**用 `children` 声明，否则 `renderSlot` 拿不到内容 |
| 会话列表 | 框架 props 的 `useSessions(selector)`；`byId` 里每条摘要带 `retainedBy.mainView` |
| 打开会话 | `uiWorkspace.openSession(sessionId)` |
| 新建会话 | `sessions.create({ workspaceId })`（**必须给工作区**，见 D-02） |
| 找/建目录工作区 | 侧栏快照 `useWorkspaces().items` 按 `path` 匹配；没有就 `workspaces.create({ path })` |
| 会话"当前打开" | `byId` 中 `retainedBy.mainView > 0` 的那条 |
| 行选中样式 | 宿主类 `selected`（`rowsClass('selected')`）+ `aria-selected` |
| 弹出菜单 | `Menu` + `getAnchorRect()`（**不要**传 anchor 元素，见 D-01） |
| 宿主 CSS 类名 | 运行时反查前缀（`rowsClass()`），不硬编码哈希 |
| 客户端包纯净度 | 只允许 `react` 家族、`@deepseek-ai/dsh-client-ui-primitives`、`../schema/node-state-label` |

---

## 3. 交付前自检

1. `build` + `smoke` 都过；
2. 客户端改动后**实际刷新页面**看一眼（只装不刷等于没改）；
3. 新增持久化字段：旧快照没有该字段时能否正常读（zod 里一律 `.optional()`）；
4. 新增 HTTP 路由：重启插件后再 `curl` 一次，确认不是旧路由在跑；
5. 涉及槽位/服务名：先用 `cordis_inspect_query` 查活体，不靠记忆。

---

## 4. 踩坑清单

### D-01 弹菜单的位置：必须用 `getAnchorRect()`，不要传 anchor 元素，更不要自绘

- **现象**：点行尾「⋯」，菜单出现在侧栏顶部/左上角，跟按钮完全没关系；行越靠下偏得越远。
- **根因**：本版本 `ui-primitives` 的 `Menu` **不测量** `anchor` 传入的 React 元素，只认 `getAnchorRect()`。
  传元素时它拿不到坐标，退回默认位置。参见宿主 `@deepseek-ai/dsh-client-ui-context-menu` 的调用：
  `anchor: null` + `getAnchorRect: () => new DOMRect(point.x, point.y, 0, 0)`。
- **错误做法**：`<Menu anchor={<button .../>} />`；或自己写 `<div style={{position:'fixed'}}>` 自绘菜单
  （位置对了，但颜色/圆角/深浅色/键盘导航全部脱离宿主主题）。
- **正确做法**：

```tsx
const [point, setPoint] = useState<MenuPoint | null>(null);

<button
  className={rowsClass('iconButton')}
  onClick={(event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPoint((current) => (current === null ? { x: rect.left, y: rect.bottom + 2 } : null));
  }}
/>

{point !== null ? (
  <Menu
    open
    anchor={null}
    portal
    getAnchorRect={() => new DOMRect(point.x, point.y, 0, 0)}
    items={items}
    onClose={() => setPoint(null)}
    onSelect={(id) => { /* ... */ }}
  />
) : null}
```

- **验证**：点列表最下面那行的「⋯」，菜单应紧贴按钮下方；再切浅色主题，颜色应跟着变（菜单本体是宿主的，自动跟随主题变量）。
- **涉及文件**：`src/client/workspace-ui.tsx`（`menuPointFromEvent` / `menuAnchorRect`）、
  `workspace-browser.tsx`、`workflow-embedded.tsx`。

### D-02 会话必须挂在真实的目录工作区上，只给 `cwd` 会落到「选择工作区」

- **现象**：点 workflow 节点打开了会话，但输入框上方显示「选择工作区」，会话不属于任何工作区。
- **根因**：`sessions.create({ cwd })` 只给了工作目录，没给工作区实体；宿主 UI 认为该会话尚未归属工作区。
- **正确做法**：先按目录找宿主已有的目录工作区（`useWorkspaces().items` 里 `path` 匹配，Windows 下忽略大小写与结尾斜杠），
  找不到就 `workspaces.create({ path })` 补建，然后 `sessions.create({ workspaceId })`。
- **副作用（必须告知用户）**：补建会让侧栏多出一个同名的普通目录工作区（文件夹图标）。
- **验证**：点节点后会话直接落在该目录工作区里，输入框可用，不再出现「选择工作区」。

### D-03 选中态用宿主判据，不要自己记"最后点了谁"

- **现象**：点开的会话行鼠标移开就不高亮了；或换了会话后高亮还留在旧行。
- **根因**：行高亮是"哪条会话被主视图持有"，不是"最后点击"。
- **正确做法**：`useSessions` 快照里找 `retainedBy.mainView > 0` 的会话 id，命中行加 `selected` 类 + `aria-selected`。
  普通会话行和 workflow 节点行共用同一个计算值（由侧栏浏览器算好传给类型插件）。
- **验证**：点 A 再点 B，高亮跟着走；用其它入口（命令面板等）打开 C，高亮也要跟着走。

### D-04 客户端包不能沾 zod

- **现象**：整个客户端 entry 启动失败，侧栏回落到宿主原生浏览器。
- **根因**：客户端模块表不提供 zod；从客户端 import `src/schema/*`（除了 `node-state-label.ts`）会把 zod 拖进包。
- **正确做法**：客户端只 import `../schema/node-state-label`；其它 schema 只在宿主半用。
- **验证**：`pnpm run smoke` 里有纯度检查；另外看包里 `require("zod")` 必须为 0。

### D-05 改完客户端要硬刷新，改完宿主半要重启插件

- **现象**：改了代码、页面没变化，误以为改错。
- **正确做法**：客户端 `Ctrl+Shift+R`；宿主半用 `plugin_manager set_plugin` 关→开，或重启应用。
- **验证**：改一行可见文案，刷新后能立刻看到。

### D-06 esbuild 在受限沙箱里会 `spawn EPERM`

- **现象**：`node scripts/build-host.mjs` 报 `EPERM spawn`。
- **根因**：esbuild 的 JS API 用**管道 stdio** 拉起子进程，受限模式禁止管道。
- **正确做法**：直接跑 esbuild CLI（继承 stdio）；`scripts/build-host.mjs` 已改成优先 CLI、找不到再回退 JS API。
- **附带坑**：pnpm 有时装不上可选依赖 `@esbuild/win32-x64`，报 `The package "@esbuild/win32-x64" could not be found`；
  手动下载同版本 tarball 解到 `node_modules/@esbuild/win32-x64/` 即可。

### D-07 `dist/host.js` 必须是 esbuild 单文件

- **现象**：宿主半 `ERR_MODULE_NOT_FOUND`。
- **根因**：`tsc` 产出的是「不带扩展名」的相对 import，Node ESM 解析不了。
- **正确做法**：每次改宿主源码都要跑 `build-host.mjs`；只跑 `tsc` 不算数。

### D-08 槽位结构会随 DSH 升级变，先查活体再写注册

- **现象**：插件整个失效，侧栏变回原生；控制台抛 `slot ... is already declared` 或子槽拿不到条目。
- **正确做法**：
  `cordis_inspect_query('client','Slots','listSubTree',{root:'sidebar.workspaces'})` 看当前的 children catalog 与 occupants，
  确认子槽名/priority 后再改代码。历史教训：`sidebar.workspaces.session.menu.item` 已迁到 `contextMenu.content` 下，
  继续声明会让整份注册失败。
- **补充**：`single` 槽同优先级会抛，我们注册 `priority: -1` 压过宿主 `0`；子槽必须由正在渲染的那份注册声明。

### D-09 补建目录工作区是可见副作用

- **现象**：第一次点某目录下的节点，侧栏突然多出一个文件夹图标的工作区。
- **根因**：DSH 的会话必须归属一个目录工作区，而 workflow 工作区不是宿主的工作区实体。
- **处理**：属于预期行为；若用户不希望，可改成统一挂到某个固定工作区（改 `resolveWorkspaceId` 的兜底）。

### D-10 绑定的会话如果没工作区，靠"重新绑定"救

- **背景**：节点字段 `session_id` 一旦写入就会一直复用；早期版本建出的空壳会话（无工作区）会导致点开仍是「选择工作区」。
- **做法**：节点「⋯」菜单里的「重新绑定会话」= 先 `bind-session` 传空串解绑，再按新规则重建。
- **解绑的语义**：传空串 = **删掉该字段**，不是留 `""`（旧快照无字段时行为才一致）。

### D-11 推 GitHub 连不上（本机网络）：DNS 把 github.com 解析到超时 IP

- **现象**：`git push` 报 `Failed to connect to github.com port 443 after 21000 ms`；
  但 `api.github.com`、`codeload.github.com` 都能通，`https://github.com` 的网页有时也正常。
- **根因**：本机 DNS 只返回 `20.205.243.166`，这个 IP 从当前网络不通；而 `140.82.113.3` 等其它 GitHub IP 可达。
  git 自身没有「按命令强制解析 IP」的可用开关（`http.curloptResolve` 在本机会撞上 SSL backend 报错，
  `http.sslbackend=schannel` 又会报 `SEC_E_NO_CREDENTIALS`）。
- **正确做法**：本地起一个 CONNECT 隧道，把 `github.com:443` 转发到可达 IP，再让 git 走它。

```powershell
# 1) 后端小脚本（Node）：监听 127.0.0.1:8899，把 github.com 的 CONNECT 转发到可达 IP
#    代码见本仓库 scripts/dev-github-tunnel.cjs
node scripts/dev-github-tunnel.cjs

# 2) 推送时走代理
git -c http.proxy=http://127.0.0.1:8899 push origin main
```

- **验证**：先 `git -c http.proxy=... ls-remote --heads origin`，能看到 `refs/heads/main` 即为通。
- **注意**：隧道只转发 `github.com`，`api.github.com` 直连即可；用完记得关掉进程。
- **备用排查**：`Resolve-DnsName github.com -Type A` 看当前解析出的 IP；换一个可达 IP 改脚本里的 `FORWARD_IP`。

### D-12 行内元素要照抄宿主的包装层，少一层就挤在一起

- **现象**：行尾的「⋯」紧贴左边的时间/状态文字（`5 分钟⋯`、`未开始⋯`），和宿主原生行的留白不一样。
- **根因**：宿主把「时间 + trailing 子槽 + 置顶标记」包在 `rowResting` 这一层里，由它负责右侧留白和子元素间距；
  我们直接把 `time` 和 `rowActions` 并排放在行上，少了这层容器，两者之间没有间隙。
- **正确做法**：照宿主的 DOM 结构抄——

```tsx
<span className={rowsClass('title')}>{title}</span>
{!blank ? (
  <span className={rowsClass('rowResting')}>
    <span className={joinClasses(rowsClass('time'), trailingLabel === undefined && rowsClass('timestamp'))}>{label}</span>
    {renderSlot('sidebar.session.row.trailing', { sessionId })}
    {pinned ? <PinnedIndicator /> : null}
  </span>
) : null}
<span className={rowsClass('rowActions')}>{/* ⋯ 按钮 */}</span>
```

- **验证**：行尾「⋯」与时间文字之间有明显间距；空白会话行不渲染这两段。
- **通用教训**：用宿主 CSS 类复刻行样式时，**连包装层一起抄**，只抄叶子类名会缺定位/间距规则。

### D-13 一个目录工作区只能有一种类型：workflow 工作区**就是**宿主目录工作区

- **现象**：建 workflow 工作区、或第一次点它的节点后，侧栏同一个目录出现两行（树图标的 workflow + 文件夹图标的同名目录工作区）。
- **根因**：早期把 workflow 当成「插件自造的另一种工作区」，于是宿主那边还要再建一个目录工作区来装会话，两者并存。
- **正确模型**：workflow 工作区 = 宿主目录工作区 + 类型插件认领。侧栏按 `matchWorkspace` 判断认领关系，认领的用类型插件渲染，否则按 usual 渲染；**同一目录只会渲染一行**。
- **创建流程**（必须这个顺序）：

```
1) workspaces.create({ path })            -> hostWorkspaceId
2) POST /dsh-agent-workflow/create { path, hostWorkspaceId }
3) 快照里写 host_workspace_id（类型 z.string().optional()）
```

- **列表契约**：`/list` 返回的每一项带 `workspaceId`（= `host_workspace_id`）；旧快照没有该字段，侧栏用 `path` 兜底匹配。
- **侧栏渲染顺序**：先遍历宿主 `useWorkspaces()`，命中被认领的交给 `plugin.renderItem`；没被认领的类型项再单独渲染（兼容旧数据/建工作区失败的孤儿）。
- **验证**：侧栏同一目录只有一行；新建 workflow 后立刻只出现一行（树图标），不会多出同名文件夹行；点节点建会话不再产生新行。
- **涉及文件**：`workspace-kind-registry.ts`（`matchWorkspace` / `normalizeWorkspacePath`）、`workflow-embedded.tsx`、`workspace-browser.tsx`、`src/host/workflow-repository.ts`（`host_workspace_id`）、`src/host.ts`（create 路由）。

---

## 5. 记录格式（新增条目照抄）

```
### D-XX 一句话标题（现象层面的说法）

- **现象**：用户能看到/能触发到什么。
- **根因**：宿主或代码里的确切原因，不确定就写"未确认"。
- **正确做法**：可直接抄的代码或命令。
- **验证**：怎么点、看哪里、看哪个值。
- **涉及文件**：路径。
```
