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

## 3. 侧栏行结构模型（重要，改 UI 前先看这节）

一个 workflow 工作区在侧栏只有**两行层级**，不要再加第三层：

### 3.1 工作区行（= 根节点，同一行）

`_AI` 这一行同时代表「workflow 工作区」和「它的根节点」：

| 位置 | 内容 |
| --- | --- |
| 左 | 类型图标（树）+ 展开三角 |
| 中 | 标题（取宿主工作区标题，改名后立刻同步） |
| 右 | 根节点状态（未开始/讨论中/…）+「⋯」（重命名 / 删除工作区）+「→」（推进根状态）+「+」（新建子节点） |

- **点整行 = 展开 / 收起节点树，不打开会话**（和 usual 工作区行一致）。
- 根节点**不绑会话**，所以这一行没有会话菜单。

### 3.2 节点行（子节点，递归）

- 左：状态色点；中：节点标题；右：状态文字 +「⋯」（宿主会话菜单）+「→」（推进状态）+「+」（加子节点）。
- **点整行 = 打开该节点绑定的会话**（没有就新建并绑定）。
- 缩进按层级递增（每层 14px）。

### 3.3 数据层与渲染层的对应

- 数据里根节点依然存在：`parent_id === null`、`node_type === 'workspace'`、`title` 为空。
- 渲染时**跳过根节点那一行**，只把它的状态/操作挂到工作区行上，子节点从 `child_ids` 递归渲染。
- `node_type` 枚举有 `workspace / feature / task` 三个值，但 UI **只按"是否根节点"分支**，不按 node_type 分支；`feature` 目前未被使用（新建一律写 `task`）。

> 历史教训见 D-14：根节点单独成行会变成「两层皮」。

---

## 4. 交付前自检

1. `build` + `smoke` 都过；
2. 客户端改动后**实际刷新页面**看一眼（只装不刷等于没改）；
3. 新增持久化字段：旧快照没有该字段时能否正常读（zod 里一律 `.optional()`）；
4. 新增 HTTP 路由：重启插件后再 `curl` 一次，确认不是旧路由在跑；
5. 涉及槽位/服务名：先用 `cordis_inspect_query` 查活体，不靠记忆。

---

## 5. 踩坑清单

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
- **附带坑：开菜单前先把焦点放到触发按钮**（`event.currentTarget.focus({ preventScroll: true })`）。
  否则焦点留在打开前的位置，宿主菜单 dismiss 时无法归还焦点，而它又会给菜单容器加 `aria-hidden`，
  浏览器就报 `Blocked aria-hidden on an element because its descendant retained focus`。
  这个警告不影响功能，但控制台会一直刷。
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

### D-10 绑定的会话失效时要能自愈（并复用宿主菜单）

- **背景**：节点字段 `session_id` 一旦写入就会一直复用；早期版本建出的空壳会话（无工作区）或已被归档的会话会导致点开没反应。
- **现在的做法**：点节点时先查 `sessions.list` 里还有没有这个 id——还在就 `openSession`；不在就打日志、`bind-session` 传空串解绑，然后按新规则重建并重新绑定。不再需要手动「重新绑定会话」菜单项。
- **解绑的语义**：传空串 = **删掉该字段**，不是留 `""`（旧快照无字段时行为才一致）。
- **节点「⋯」菜单**：自建菜单（置顶会话 / 重命名 / 复制 Session ID / 归档会话），动作调宿主的 `uiWorkspace` 服务。
  **不出现「分叉会话」**——workflow 节点会话是一一绑定，分叉会破坏对应关系。
  未绑定会话的节点只有「新建子会话」。
- **教训**：能交给宿主的交互优先交给宿主；但只要需要**裁剪掉其中某一项**，就只能自建菜单，并自己承担动作与状态回显（见 D-15、D-17）。

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
- **旧数据一次性回写**：侧栏加载时，若某条 workflow 没有 `workspaceId` 但按路径找到了宿主目录工作区，
  就 `POST /dsh-agent-workflow/link-workspace { id, hostWorkspaceId }` 写回快照（客户端用 ref 记录已处理项，只跑一次）。
  写回后认领不再依赖路径比对；传空串 `hostWorkspaceId` 可清除绑定。
- **侧栏渲染顺序**：先遍历宿主 `useWorkspaces()`，命中被认领的交给 `plugin.renderItem`；没被认领的类型项再单独渲染（兼容旧数据/建工作区失败的孤儿）。
- **改名/删除走宿主**：认领行不自己维护标题——渲染时用宿主工作区标题覆盖；「重命名」调用宿主对话框，「删除工作区」先删宿主工作区、**再删对应的类型快照**（否则会留下打不开的孤儿行，`POST /dsh-agent-workflow/delete`）。
- **验证**：侧栏同一目录只有一行；新建 workflow 后立刻只出现一行（树图标），不会多出同名文件夹行；点节点建会话不再产生新行。
- **涉及文件**：`workspace-kind-registry.ts`（`matchWorkspace` / `normalizeWorkspacePath`）、`workflow-embedded.tsx`、`workspace-browser.tsx`、`src/host/workflow-repository.ts`（`host_workspace_id`）、`src/host.ts`（create 路由）。

### D-14 同一个东西不要渲染成两层皮

- **现象**：侧栏里出现「`_AI`（树图标 + 三角）」和「`workspace`（圆点 + 状态）」两行；后者名字是英文 `workspace`，看着像另一种东西。
- **根因**：工作区行和根节点行是两套渲染路径，但代表的是同一个实体；根节点没有 `title`，渲染回退成 `node_type` 字面量，于是显示成了 `workspace`。
- **正确做法**：根节点**不单独渲染**，它的状态与「推进/加子节点」操作挂到工作区行上；子节点从 `child_ids` 递归渲染。见第 3 节的行结构模型。
- **验证**：展开一个 workflow，只看到「一行工作区（带状态）」+「若干缩进的子节点」，没有第二行同义节点。
- **涉及文件**：`src/client/workflow-embedded.tsx`（`WorkflowWorkspaceItem` / `renderNodeRow`）。

### D-15 把操作委托给宿主之后，行必须回显结果

- **现象**：节点「⋯」里的「置顶会话 / 归档会话 / 重命名」点了"没反应"，控制台也没有报错。
- **根因**：菜单和动作都是宿主的，改动写进了宿主状态（`workspace.json` 的 `pinnedSessionIds` / `archivedSessionIds`、会话标题），
  但我们的节点行只读自己的快照（`title` / `session_id`），从不读会话状态，所以界面上看不到任何变化。
  实测证据：点了三次置顶后 `pinnedSessionIds` 里确实多了三个节点会话，但行上没有任何标记。
- **正确做法**：渲染节点行时同时读宿主状态——

```tsx
const sessionsById = ctx.get('sessions')?.list?.getSnapshot()?.byId ?? {};
const workspaceSnapshot = ctx.get('workspaces')?.list?.getSnapshot() ?? null;
const pinned = new Set(workspaceSnapshot?.pinnedSessionIds ?? []);
const archived = new Set(workspaceSnapshot?.archivedSessionIds ?? []);

const summary = node.session_id ? sessionsById[node.session_id] : undefined;
const title = summary?.title?.trim() || node.title || '未命名会话';  // 改名立刻可见
const p = node.session_id ? pinned.has(node.session_id) : false;      // 星标
const a = node.session_id ? archived.has(node.session_id) : false;    // 变淡 + 「已归档」
```

- **验证**：置顶后行尾出现星标；重命名会话后行标题跟着变；归档后整行变淡、显示「已归档」、点击不再尝试打开。
- **已知缺口**：宿主菜单里的「复制 Session ID」「放入回收站」等操作的**提示（Toast）我们没渲染**（Toast 由被替换掉的宿主浏览器组件渲染），
  所以这些操作仍是"静默成功"。要补就得自己注册 `workspace.toast` 的渲染入口。
- **涉及文件**：`src/client/workflow-embedded.tsx`。

### D-16 「置顶会话」在我们的树里意味着什么，必须由我们定义

- **背景**：宿主只做一件事——把会话记进 `pinnedSessionIds`（见 `~/.dsh/storages/workspace.json`）。它不知道我们的节点树，也不会替我们排序。
- **我们的定义**：节点置顶 = **同级之内排到最前** + 行尾星标。
  - 排序在渲染期计算（`sortNodesPinnedFirst`），**不写回快照**，`child_ids` 顺序保持原样；
  - 未置顶的节点保持 `child_ids` 原顺序（稳定排序），所以取消置顶会回到原位。
- **为什么这样定义**：宿主侧栏的「置顶会话」就是"在该工作区内排前面"；不定义这个行为的话，置顶只写数据，界面上什么都看不见（D-15 的教训）。
- **验证**：置顶某个子节点 → 它跳到同级第一位并出现星标；取消置顶 → 回到原来的位置。
- **涉及文件**：`src/client/workflow-embedded.tsx`（`isNodePinned` / `sortNodesPinnedFirst`）。

### D-17 宿主的上下文菜单不能按项裁剪

- **现象**：想从 workflow 节点的会话菜单里去掉「分叉会话」，但宿主菜单是整体弹出来的。
- **根因**：`contextMenus.register` 以 `target/id` 为键，ui-workspace、open-in-app、session-purge 等**多个插件各自注册 provider**；
  既没有"禁用某一项"的 API，`open(target, point)` 也没有排除参数，`MenuOverlay` 直接把全部 provider 的结果渲染出来。
- **做法**：要裁剪就自建 `Menu`，动作调宿主服务：
  - 置顶 / 取消置顶 → `uiWorkspace.pinSession` / `unpinSession`
  - 归档 / 取消归档 → `uiWorkspace.archiveSession` / `unarchiveSession`
  - 重命名 → `runtime.requestRenameSession`（复用侧栏的重命名对话框）
  - 复制 Session ID → `writeClipboard`（`ui-primitives` 导出）
- **代价**：宿主菜单里**其它插件**提供的项（「在文件夹显示」「放入回收站」）拿不到，只能不要。
- **验证**：节点「⋯」只有四项且没有「分叉会话」；置顶后行上出现星标并排到同级最前；归档后行变淡。
- **涉及文件**：`src/client/workflow-embedded.tsx`（`runSessionMenuAction`）。

---

## 6. 记录格式（新增条目照抄）

```
### D-XX 一句话标题（现象层面的说法）

- **现象**：用户能看到/能触发到什么。
- **根因**：宿主或代码里的确切原因，不确定就写"未确认"。
- **正确做法**：可直接抄的代码或命令。
- **验证**：怎么点、看哪里、看哪个值。
- **涉及文件**：路径。
```
