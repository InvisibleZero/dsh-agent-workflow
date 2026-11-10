# dsh-agent-workflow —— Agent 编排与 Workflow 状态机插件

> 给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的桌面版插件：左侧是原生的目录工作区列表，每个工作区里可以长出**树形子节点**，每个子节点 = 一个 DSH 会话，按**五态状态机**逐步推进；当前状态会自动决定注入给模型的操作细节与工作手册。

- **仓库地址**：<https://github.com/InvisibleZero/dsh-agent-workflow>
- **版本**：`0.1.0`
- **验证环境**：DSH `0.2.2-rc.1`（Windows 桌面版）
- **开发手册**：[DEVELOPMENT.md](./DEVELOPMENT.md)（构建命令、宿主契约速查、踩坑清单 D-01 起）

---

## 它解决什么问题

DSH 原生只有「工作区 → 会话」这一层。真实任务经常是树形的：一个需求下面挂着若干子任务，每个子任务有自己的进度、自己的上下文。这个插件把这一层补上：

- **树形节点**：工作区是根，往下可以无限层加子节点（受 `max_depth` 限制）；
- **节点即会话**：每个子节点对应一个真实的 DSH 会话，点开就在右侧对话；
- **状态驱动上下文**：节点处在「讨论中 / 实现中 / 验收中」时，模型看到的操作规范和记录要求不一样；
- **AI 自留笔记**：每个节点有自己的「工作手册 + 手册摘要」，AI 自己写、自己读，子节点能看父级摘要（只一层）。

---

## 功能

### 1. 侧栏工作区（宿主同款外观）
workflow 工作区就是宿主的一个**目录工作区**，只是渲染走类型插件；同一个目录只出现一行，不会重复。搜索、视图选项（分组/排序/归档过滤）、置顶、归档、重命名等沿用宿主实现。

### 2. 树形子节点
- 根节点（工作区）永远不绑会话，点它只是展开/折叠；
- 子节点可以继续往下加，形成树；
- 节点行显示：状态色点 + 标题（会话有名字就显示名字）+ 状态文字 + 「⋯」+「+」。

### 3. 五态状态机
```
未开始 ──(首次对话)──▶ 讨论中 ──▶ 实现中 ──▶ 验收中 ──▶ 已完结
  │                      │         │          │
  │(保留态,无细节)       (B)       (C)        (D)        (终态,无细节)
  └──────────────────────┴── 返工：实现中/验收中 ──▶ 讨论中 ──┘
```

### 4. 会话里的状态徽标
权限控件右侧有一个可点的**状态胶囊**（例如「● 实现中」）：

- 点它 → 打开「节点补充说明」；
- 它右边的箭头 → 一步推进到下一状态；
- 推进成功后，会把新状态的**默认输入**填进输入框（不自动发送，你看一眼再回车）。

### 5. 操作细节 A / B / C / D（应用级全局）
设置 → **Agent 工作流**：

- **A 公共**：三个活跃状态通用，每个节点都读；
- **B/C/D**：讨论中 / 实现中 / 验收中各自的专属细节 + 进入后默认输入；
- 改动 **700ms 自动保存**，没有保存按钮。

### 6. 节点级附加说明
点状态徽标打开的弹窗里可以给**某个节点**加一段补充：

- 「本节点附加（所有状态都会追加）」；
- 以及讨论中/实现中/验收中各自的附加；
- 是**纯增量**，不覆盖全局，删掉就回到全局原样。

### 7. 按状态注入上下文
通过 `systemPrompt.context()` 注入，每次装配重新求值、不写进聊天记录。注入顺序：

```
节点 / workflow / 当前状态
A（公共）+ 当前状态的 B/C/D
本节点「全局附加」
本节点「该状态附加」
本节点工作手册（最近 2000 字 + 文件路径）
上级手册摘要（只一层）
```

### 8. 节点工作手册 / 手册摘要（AI 自留）
新建子节点时，在工作区根目录的 `.workflow/` 下平铺两份 md：

```
<你的工作区>/.workflow/
  工作手册-<node_id>.md     ← AI 自留：要点 / 需求 / 疑难杂症
  手册摘要-<node_id>.md     ← 手册的概要，随手册一起改
```

- 不用建目录、不用按标题命名：文件名带 `node_id` 自索引，改标题、重名都不会冲突；
- 节点弹窗里可以**只读查看**手册和上级摘要，也能一键打开 `.workflow` 目录；
- 根节点不建（没人写），存量节点不迁移，**只对新节点生效**；
- `.gitignore` 若存在，会自动补一行 `.workflow/`。

---

## 安装

### 方式一：从 GitHub 安装（推荐）

```bash
# 1. 进入你的 DSH profile（默认叫 desktop）
cd ~/.dsh/profiles/desktop

# 2. 安装（用 DSH 自带的 pnpm，或系统 pnpm）
pnpm add github:InvisibleZero/dsh-agent-workflow#main
```

然后确认该目录下的 `package.json` 里，`dsh.profile.bundles` 数组包含 `"dsh-agent-workflow"`（pnpm 不会自动加，需要手动补）：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-agent-workflow"
      ]
    }
  }
}
```

### 方式二：本地开发（link 到源码目录）

```bash
# 1. 先构建出 dist（插件入口是 dist/host.js 与 dist/client-bundle.js）
cd <仓库目录>
pnpm install --node-linker=hoisted
pnpm build

# 2. link 进 profile
cd ~/.dsh/profiles/desktop
pnpm add link:<仓库绝对路径>
```

同样把 `"dsh-agent-workflow"` 加进 `dsh.profile.bundles`。

### 安装后怎么生效

| 改了什么 | 怎么生效 |
| --- | --- |
| 宿主半（`dist/host.js`、路由、注入逻辑） | 插件页把它**关一次再开**，或重启 DSH |
| 客户端半（`dist/client-bundle.js`、界面） | 页面 **Ctrl+Shift+R** 硬刷新 |
| 只改设置里的文案 | 立即生效 |

插件声明了两半：

- 宿主半：`package.json` 的 `dsh.bundle.patch` → `cordis.patch.yml`，自动插入 `id: dsh-agent-workflow`；
- 客户端半：`dsh.client` 声明 + `exports["./client"]` 指向 `dist/client-bundle.js`。

---

## 仓库开发

```bash
pnpm install --node-linker=hoisted   # 本环境沙箱需要平铺 node_modules
pnpm build                           # tsc 宿主 → esbuild 单文件 → tsc 客户端 → 打客户端包
pnpm smoke                           # 客户端冒烟：槽位注册是否正常
pnpm typecheck                       # 只做类型检查
```

构建产物：

- `dist/host.js`：宿主半单文件（ESM）
- `dist/client-bundle.js`：客户端半单文件（lazy-CJS，由 `window.__ModuleLoader__` 加载）

---

## 目录结构

```
src/
├── host.ts                    # 宿主半入口：HTTP 路由（list/create/get/add-node/transition/…）
├── host/
│   ├── workflow-repository.ts # workflow 快照读写、节点增删、手册/摘要文件读写
│   └── workflow-state-context.ts # 按状态注入上下文（systemPrompt.context）
├── schema/                    # 数据模型（Zod）：node / node-state / workflow / transition / trace / fault
├── engine/                    # 纯逻辑，零框架依赖：状态机 / 树 / 聚合 / 打断 / 熔断 / 故障路由
├── adapter/                   # 端口与实现：json-storage（原子写）/ port / dsh-runtime / context-summary
├── service/                   # 面向 agent 的 workflow 工具
└── client/                    # 浏览器半
    ├── dsh-plugin.tsx         # 客户端入口（注册槽位与服务）
    ├── workflow-embedded.tsx  # 侧栏工作区行 / 子节点行 / 会话状态徽标
    ├── workflow-dialogs.tsx   # 操作细节设置页 + 节点补充说明弹窗
    ├── workspace-browser.tsx  # 侧栏浏览器（照抄宿主的 WorkspaceBrowser）
    ├── workspace-ui.tsx       # 侧栏共享 UI 原语（CSS 类解析 / 图标 / 菜单坐标）
    ├── workspace-kind*.ts     # 工作区类型注册（usual / workflow）
    └── …
```

---

## 已知限制

- **工作手册的隔离是「约定级」**：所有会话的工作目录都是工作区根，模型技术上能读到别人的 `.workflow/*.md`，只靠注入内容与提示语约束；
- **删工作区是软删除**：只删「工作区记录 + workflow 快照」，文件夹、会话日志、`.workflow/` 笔记都留在磁盘上；重建会得到全新的 `node_id`，旧笔记成为孤儿文件；
- **节点弹窗不提供编辑手册的入口**：手册由 AI 自己写，人只读；
- **单位口径**：文件读取按字节截断（防读爆），注入按字符截断（"最近 2000 字"），两者用途不同。

---

## 相关文档

- [DEVELOPMENT.md](./DEVELOPMENT.md)：构建命令、宿主契约速查、踩坑清单（D-01 起）
- [HANDOFF.md](./HANDOFF.md)：交接说明
- [SPIKE.md](./SPIKE.md)：最初的技术验证记录
