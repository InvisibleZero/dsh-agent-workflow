// src/host.ts
import { homedir } from "node:os";
import { join as join3 } from "node:path";
import { spawn } from "node:child_process";

// src/host/workflow-repository.ts
import { promises as fs2 } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID as randomUUID2 } from "node:crypto";

// src/adapter/json-storage.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// src/schema/workflow.ts
import { z as z3 } from "zod";

// src/schema/node.ts
import { z as z2 } from "zod";

// src/schema/node-state.ts
import { z } from "zod";
var NodeState = z.enum([
  "discussing",
  // 讨论中（B）
  "implementing",
  // 实现中（C）
  "verifying",
  // 验收中（D）
  "completed"
  // 已完结（终态）
]);
var ActiveState = z.enum(["discussing", "implementing", "verifying"]);
var NodeFlag = z.enum(["blocked"]);
var StateDetail = z.object({
  operation_detail: z.string(),
  enter_trigger: z.string().nullable()
});
var ACTIVE_STATE_ORDER = [
  "discussing",
  "implementing",
  "verifying"
];
function isActiveState(state) {
  return ACTIVE_STATE_ORDER.includes(state);
}

// src/schema/node.ts
var AgentNode = z2.object({
  node_id: z2.string(),
  parent_id: z2.string().nullable(),
  // 根节点为 null
  /**
   * 节点显示名。可选：旧快照没有，UI 回退到 node_type。
   * （根节点的 title 与 WorkflowSnapshot.title 一致，不重复写也行。）
   */
  title: z2.string().optional(),
  /**
   * 该节点绑定的 dsh 会话 id：点节点行时打开这个会话；没有则新建一个再写回。
   * 可选：旧快照没有这个字段，第一次点击时才写入。
   */
  session_id: z2.string().optional(),
  node_type: z2.enum(["workspace", "feature", "task"]),
  current_state: NodeState,
  child_ids: z2.array(z2.string()),
  context_payload: z2.unknown(),
  /** 横切标志（如 blocked = 异常阻塞待人审）。 */
  flags: z2.array(NodeFlag).default([]),
  /**
   * 子节点对「自己当前状态」专属细节的覆盖。
   * 键只能是活跃态，值覆盖该态的专属细节（不动公共 A）。
   * 父节点（workspace 根）不写此字段。
   */
  state_detail_overrides: z2.object({
    discussing: StateDetail.optional(),
    implementing: StateDetail.optional(),
    verifying: StateDetail.optional()
  }).optional(),
  /**
   * 节点级「附加说明」：不改全局设置，只在本节点当前状态后面追加一段。
   * 与覆盖相反——是纯增量，删掉就回到全局原样。
   * `global` 是这个节点的「全局附加」：不管当前什么状态都追加。
   */
  additional_detail: z2.object({
    global: z2.string().optional(),
    discussing: z2.string().optional(),
    implementing: z2.string().optional(),
    verifying: z2.string().optional()
  }).optional(),
  /**
   * 状态迁移时间线：每次推进追加一条 { at, from, to }。
   * 可选，旧快照没有。
   */
  history: z2.array(z2.object({
    at: z2.string(),
    from: z2.string(),
    to: z2.string(),
    /** 谁触发的这次迁移：human（点胶囊）/ agent-request（模型请求并经人同意）/ agent（返工等）。 */
    by: z2.string().optional()
  })).optional(),
  // —— 防御性约束 ——
  depth: z2.number().int().nonnegative(),
  max_depth: z2.number().int().positive(),
  step_count: z2.number().int().nonnegative(),
  max_steps: z2.number().int().positive()
});

// src/schema/workflow.ts
var HardRules = z3.object({
  discussing: z3.string().optional(),
  implementing: z3.string().optional(),
  verifying: z3.string().optional()
});
var GlobalOperationDetail = z3.object({
  shared_detail: z3.string(),
  // A：三态通用的公共操作细节
  discussing: StateDetail,
  // B
  implementing: StateDetail,
  // C
  verifying: StateDetail,
  // D
  /** 硬规则覆盖值；缺省 = 用 DEFAULT_HARD_RULES。 */
  hard_rules: HardRules.optional()
});
var AggregationMode = z3.enum(["manual", "all_complete", "any_active"]);
var WorkflowSettings = z3.object({
  global_operation_detail: GlobalOperationDetail,
  default_max_depth: z3.number().int().positive(),
  default_max_steps: z3.number().int().positive(),
  aggregation_mode: AggregationMode
});
var WorkflowSnapshot = z3.object({
  version: z3.literal(2),
  workspace_id: z3.string(),
  title: z3.string(),
  /** workflow 对应的本地工作目录（用户创建时选的那个文件夹）。可选，旧快照没有。 */
  working_directory: z3.string().optional(),
  /**
   * 对应的宿主「目录工作区」id。workflow 工作区本身就是这个目录工作区，
   * 只是渲染走类型插件；旧快照没有该字段，靠 working_directory 反查。
   */
  host_workspace_id: z3.string().optional(),
  /** 是否置顶（只影响侧栏排序）。可选，旧快照没有 = 未置顶。 */
  pinned: z3.boolean().optional(),
  settings: WorkflowSettings,
  nodes: z3.array(AgentNode)
});
var DEFAULT_GLOBAL_OPERATION_DETAIL = {
  // A —— 三态通用
  shared_detail: `\u4F60\u5728\u67D0\u4E2A workflow \u8282\u70B9\u7684\u67D0\u4E2A\u9636\u6BB5\u5DE5\u4F5C\uFF1A\u5F53\u524D\u72B6\u6001\u51B3\u5B9A\u672C\u9636\u6BB5\u505A\u4EC0\u4E48\uFF0C\u4E0D\u8981\u8D8A\u8FC7\u5B83\u53BB\u505A\u4E0B\u4E00\u9636\u6BB5\u7684\u4E8B\u3002

\u7ED3\u8BBA\u5148\u884C\uFF0C\u4E0D\u786E\u5B9A\u5C31\u8BF4\u4E0D\u786E\u5B9A\uFF0C\u4E0D\u8981\u7F16\u4E00\u4E2A\u542C\u8D77\u6765\u5408\u7406\u7684\u56E0\u679C\u3002

\u6539\u52A8\u524D\u5148\u8BFB\u539F\u6587\uFF1B\u6CA1\u8BFB\u8FC7\u7684\u6587\u4EF6\u4E0D\u8981\u58F0\u79F0\u77E5\u9053\u5B83\u662F\u4EC0\u4E48\u6837\u3002`,
  // B —— 讨论中
  discussing: {
    operation_detail: `\u672C\u9636\u6BB5\u53EA\u8BA8\u8BBA\uFF0C\u4E0D\u52A8\u624B\u6539\u4EE3\u7801\u6216\u6587\u4EF6\u3002

\u9ED8\u8BA4\u300C\u5148\u5BF9\u9F50\u300D\uFF1A\u6211\u6CA1\u8BF4\u8981\u65B9\u6848\u65F6\uFF0C\u4E0D\u5217\u65B9\u6848\u6E05\u5355\u3001\u4E0D\u50AC\u63A8\u8FDB\uFF1B\u53EA\u590D\u8FF0\u76EE\u6807\u3001\u6307\u51FA\u5F85\u6F84\u6E05\u5904\u3001\u8BB0\u5F55\u7ED3\u8BBA\u3001\u7B49\u4E0B\u4E00\u6B65\u3002

\u6211\u8BF4\u300C\u7ED9\u65B9\u6848\u300D\u300C\u600E\u4E48\u9009\u300D\u300C\u6709\u4EC0\u4E48\u9009\u9879\u300D\u300C\u5C55\u5F00\u8BF4\u8BF4\u300D\u65F6\uFF0C\u624D\u6309\u4E09\u6BB5\u8F93\u51FA\uFF1A1. \u76EE\u6807\u4E0E\u73B0\u72B6 2. \u53EF\u9009\u65B9\u6848\uFF08\u81F3\u5C11\u4E24\u4E2A\uFF0C\u505A\u6CD5\u3001\u4EE3\u4EF7\u3001\u98CE\u9669\uFF093. \u53D6\u820D\u4E0E\u5EFA\u8BAE\u3002

\u9700\u8981\u5148\u786E\u8BA4\u7684\u5730\u65B9\u5355\u72EC\u5217\u51FA\u6765\uFF0C\u7B49\u4EBA\u786E\u8BA4\u540E\u518D\u63A8\u8FDB\u3002`,
    enter_trigger: null
  },
  // C —— 实现中
  implementing: {
    operation_detail: `\u672C\u9636\u6BB5\u6309\u5DF2\u786E\u8BA4\u7684\u65B9\u6848\u843D\u5730\u3002

\u5148\u8BFB\u540E\u6539\uFF1A\u53EA\u6539\u4E0E\u76EE\u6807\u76F8\u5173\u7684\u6587\u4EF6\uFF0C\u6539\u52A8\u8D8A\u5C11\u8D8A\u597D\u3002

\u6BCF\u5904\u6539\u52A8\u8BF4\u660E\u4E09\u4EF6\u4E8B\uFF1A\u6539\u4E86\u54EA\u4E2A\u6587\u4EF6\u3001\u4E3A\u4EC0\u4E48\u6539\u3001\u4F1A\u5F71\u54CD\u4EC0\u4E48\u3002

\u5B8C\u6210\u540E\u7ED9\u51FA\u9A8C\u8BC1\u65B9\u5F0F\uFF1A\u600E\u4E48\u8FD0\u884C\u3001\u770B\u4EC0\u4E48\u8F93\u51FA\u3001\u4EC0\u4E48\u7B97\u901A\u8FC7\u3002

\u5B9E\u73B0\u4E2D\u53D1\u73B0\u65B9\u6848\u6709\u6D1E\uFF0C\u505C\u4E0B\u6765\u8BF4\u660E\uFF0C\u4E0D\u8981\u81EA\u884C\u6269\u5927\u8303\u56F4\u3002`,
    enter_trigger: "\u5148\u8BFB\u4F1A\u8BDD\u624B\u518C\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\uFF0C\u6309\u672A\u52FE\u7684\u7B2C\u4E00\u5C42\u5F00\u59CB\u5B9E\u73B0\uFF0C\u5B8C\u6210\u4E00\u5C42\u52FE\u6389\u518D\u7EE7\u7EED\u3002"
  },
  // D —— 验收中
  verifying: {
    operation_detail: `\u672C\u9636\u6BB5\u4EE5\u6838\u5BF9\u4E3A\u4E3B\uFF1B\u53D1\u73B0\u95EE\u9898\u53EF\u4EE5\u76F4\u63A5\u4FEE\uFF0C\u4F46\u5FC5\u987B\u5728\u68C0\u67E5\u8868\u91CC\u6CE8\u660E\u6539\u4E86\u4EC0\u4E48\u3001\u5F71\u54CD\u54EA\u4E9B\u9A8C\u6536\u9879\u3002

\u4EA4\u4E00\u5F20\u68C0\u67E5\u8868\uFF0C\u4E00\u884C\u4E00\u9879\uFF1A

\uFF5C\u9A8C\u6536\u9879\uFF5C\u7ED3\u679C\uFF08\u901A\u8FC7 / \u4E0D\u901A\u8FC7\uFF09\uFF5C\u8BC1\u636E\uFF08\u547D\u4EE4\u8F93\u51FA\u3001\u65E5\u5FD7\u3001\u6587\u4EF6\u4F4D\u7F6E\u3001\u754C\u9762\u73B0\u8C61\uFF09\uFF5C

\u53E6\u5916\u5FC5\u987B\u5199\u4E24\u6BB5\uFF1A

1. \u56DE\u5F52\uFF1A\u5217\u51FA\u53EF\u80FD\u88AB\u5F71\u54CD\u7684\u539F\u6709\u884C\u4E3A\uFF0C\u9010\u9879\u8BF4\u660E\u600E\u4E48\u786E\u8BA4\u6CA1\u574F\u3002

2. \u9057\u7559\u98CE\u9669\u4E0E\u672A\u505A\u9879\uFF1A\u8BF4\u6E05\u662F\u4EC0\u4E48\u3001\u5F71\u54CD\u4EC0\u4E48\u3001\u4EC0\u4E48\u65F6\u5019\u8BE5\u5904\u7406\u3002

\u6CA1\u6709\u8BC1\u636E\u7684\u300C\u901A\u8FC7\u300D\u4E0D\u7B97\u901A\u8FC7\uFF1B\u4E0D\u8981\u7528\u300C\u5E94\u8BE5\u6CA1\u95EE\u9898\u300D\u6536\u5C3E\u3002

\u53D1\u73B0\u5FC5\u987B\u4FEE\u7684\u95EE\u9898\uFF0C\u80FD\u5C31\u5730\u4FEE\u7684\u4FEE\u6389\u5E76\u5728\u68C0\u67E5\u8868\u6CE8\u660E\uFF1B\u6539\u52A8\u8F83\u5927\u6216\u65B9\u6848\u672C\u8EAB\u6709\u95EE\u9898\u65F6\uFF0C\u8BF4\u660E\u540E\u56DE\u5230\u5B9E\u73B0\u4E2D\u9636\u6BB5\uFF08\u8FD4\u5DE5\u8981\u5E26 reason\uFF09\u3002`,
    enter_trigger: "\u5F00\u59CB\u9A8C\u6536\uFF1A\u9010\u6761\u5BF9\u7167\u9A8C\u6536\u6761\u4EF6\uFF0C\u7ED9\u6211\u901A\u8FC7/\u4E0D\u901A\u8FC7\u548C\u8BC1\u636E\u3002"
  }
};
var DEFAULT_SETTINGS = {
  global_operation_detail: DEFAULT_GLOBAL_OPERATION_DETAIL,
  default_max_depth: 8,
  default_max_steps: 200,
  aggregation_mode: "manual"
};

// src/schema/migration.ts
var CURRENT_SNAPSHOT_VERSION = 2;
var migrateV1ToV2 = (snapshot) => {
  const rawNodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const nodes = rawNodes.map((node) => {
    if (typeof node !== "object" || node === null) return node;
    const record = node;
    return record.current_state === "not_started" ? { ...record, current_state: "discussing" } : record;
  });
  return { ...snapshot, version: 2, nodes };
};
var SNAPSHOT_MIGRATIONS = {
  1: migrateV1ToV2
};
function readSnapshotVersion(raw) {
  if (typeof raw === "object" && raw !== null && "version" in raw) {
    const version = raw.version;
    if (typeof version === "number" && Number.isInteger(version)) return version;
  }
  throw new Error("\u5FEB\u7167\u7F3A\u5C11\u5408\u6CD5\u7684 version \u5B57\u6BB5");
}
function migrateSnapshot(raw, migrations = SNAPSHOT_MIGRATIONS) {
  let snapshot = raw;
  let version = readSnapshotVersion(snapshot);
  let guard = 0;
  while (version < CURRENT_SNAPSHOT_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`\u7F3A\u5C11\u4ECE v${version} \u5230 v${version + 1} \u7684\u8FC1\u79FB`);
    snapshot = step(snapshot);
    version = readSnapshotVersion(snapshot);
    if (++guard > 100) throw new Error("\u8FC1\u79FB\u94FE\u7591\u4F3C\u6B7B\u5FAA\u73AF");
  }
  if (version > CURRENT_SNAPSHOT_VERSION) {
    throw new Error(`\u5FEB\u7167\u7248\u672C v${version} \u9AD8\u4E8E\u5F53\u524D\u652F\u6301\u7684 v${CURRENT_SNAPSHOT_VERSION}`);
  }
  return WorkflowSnapshot.parse(snapshot);
}

// src/adapter/json-storage.ts
var JsonStorageAdapter = class {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }
  snapshotPath(workspaceId) {
    return path.join(this.baseDir, "workflows", `${workspaceId}.json`);
  }
  async load(workspaceId) {
    try {
      const raw = await fs.readFile(this.snapshotPath(workspaceId), "utf8");
      return migrateSnapshot(JSON.parse(raw));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async save(snapshot) {
    const p = this.snapshotPath(snapshot.workspace_id);
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
    for (let attempt = 0; ; attempt += 1) {
      try {
        await fs.rename(tmp, p);
        return;
      } catch (error) {
        const code = error.code;
        if ((code === "EPERM" || code === "EACCES") && attempt < 6) {
          await new Promise((resolve) => setTimeout(resolve, 8 * (attempt + 1)));
          continue;
        }
        await fs.rm(tmp, { force: true }).catch(() => {
        });
        throw error;
      }
    }
  }
};

// src/host/workflow-repository.ts
var BUILTIN_PROFILE_NAME = "\u9ED8\u8BA4\u5B58\u6863";
var MIGRATED_PROFILE_NAME = "\u6211\u7684\u5B58\u6863";
function buildRootNode(id, maxDepth, maxSteps) {
  return {
    node_id: id,
    parent_id: null,
    node_type: "workspace",
    current_state: "discussing",
    child_ids: [],
    context_payload: null,
    flags: [],
    depth: 0,
    max_depth: maxDepth,
    step_count: 0,
    max_steps: maxSteps
  };
}
var WORKFLOW_SUBDIR = ".workflow";
var MANUAL_MAX_BYTES = 200 * 1024;
var GLOBAL_MANUAL_MAX_BYTES = 64 * 1024;
function sessionManualFileName(nodeId) {
  return `\u4F1A\u8BDD\u624B\u518C-${nodeId}.md`;
}
function globalManualFileName() {
  return "\u9879\u76EE\u624B\u518C.md";
}
var SESSION_MANUAL_TEMPLATE = [
  "# \u4F1A\u8BDD\u624B\u518C",
  "",
  "## \u65B9\u6848\uFF08\u81EA\u5E95\u5411\u4E0A\uFF09",
  "### 1. \u76EE\u6807\u4E0E\u9A8C\u6536",
  "<!-- \u8981\u89E3\u51B3\u4EC0\u4E48\u3001\u4E0D\u505A\u4EC0\u4E48\u3001\u9A8C\u6536\u6807\u51C6 -->",
  "### 2. \u6570\u636E\u5C42",
  "<!-- \u6570\u636E\u6A21\u578B / \u6301\u4E45\u5316 / \u8FC1\u79FB\uFF1B\u5B8C\u6210\u6807\u51C6\uFF1A\u80FD\u8BFB\u5199\u3001\u8FC1\u79FB\u53EF\u8DD1\uFF0C\u9644\u6D4B\u8BD5\u811A\u672C\uFF1B\u5C42\u95F4\u5951\u7EA6\uFF1A\u5BF9\u5916\u53EA\u66B4\u9732 ____\uFF0C\u4E0A\u5C42\u4E0D\u76F4\u63A5\u78B0\u5B58\u50A8\u5B9E\u73B0 -->",
  "### 3. \u9886\u57DF\u5C42",
  "<!-- \u6838\u5FC3\u89C4\u5219 / \u72B6\u6001\u673A / \u7B97\u6CD5\uFF1B\u5B8C\u6210\u6807\u51C6\uFF1A\u903B\u8F91\u72EC\u7ACB\u53EF\u6D4B\uFF0C\u9644\u6D4B\u8BD5\u811A\u672C\uFF1B\u5C42\u95F4\u5951\u7EA6\uFF1A\u53EA\u66B4\u9732\u7EAF\u51FD\u6570 ____\uFF0C\u4E0D\u78B0 DOM\u3001\u4E0D\u8BFB\u5199\u5168\u5C40 -->",
  "### 4. \u63A5\u53E3\u5C42",
  "<!-- \u5BF9\u5916\u5951\u7EA6\uFF08\u5DE5\u5177 / \u8DEF\u7531 / \u547D\u4EE4\uFF09\uFF1B\u5B8C\u6210\u6807\u51C6\uFF1A\u5951\u7EA6\u6D4B\u8BD5\u901A\u8FC7\uFF0C\u9644\u6D4B\u8BD5\u6587\u4EF6\uFF1B\u5C42\u95F4\u5951\u7EA6\uFF1A\u53EA\u505A\u4E8B\u4EF6 \u2192 action \u6620\u5C04\uFF0C\u4E0D\u505A\u8BA1\u7B97\u3001\u4E0D\u6E32\u67D3 -->",
  "### 5. \u8868\u73B0\u5C42",
  "<!-- UI / \u6587\u6848 / \u7AEF\u5230\u7AEF\uFF1B\u5B8C\u6210\u6807\u51C6\uFF1Abuild + smoke \u901A\u8FC7\uFF1B\u5C42\u95F4\u5951\u7EA6\uFF1A\u53EA\u6D88\u8D39\u53EA\u8BFB\u72B6\u6001\u6E32\u67D3\uFF0C\u4E0D\u53CD\u5411\u5199\u6570\u636E\u5C42 -->",
  "",
  "## \u5B9E\u65BD\u987A\u5E8F",
  "- [ ] \u6570\u636E\u5C42 \u2014\u2014 \u5B8C\u6210\u6807\u51C6\uFF1A\u80FD\u8BFB\u5199\u3001\u8FC1\u79FB\u53EF\u8DD1",
  "- [ ] \u9886\u57DF\u5C42 \u2014\u2014 \u5B8C\u6210\u6807\u51C6\uFF1A\u903B\u8F91\u72EC\u7ACB\u53EF\u6D4B",
  "- [ ] \u63A5\u53E3\u5C42 \u2014\u2014 \u5B8C\u6210\u6807\u51C6\uFF1A\u5951\u7EA6\u6D4B\u8BD5\u901A\u8FC7",
  "- [ ] \u8868\u73B0\u5C42 \u2014\u2014 \u5B8C\u6210\u6807\u51C6\uFF1Abuild + smoke \u901A\u8FC7",
  ""
].join("\n");
var GLOBAL_MANUAL_TEMPLATE = [
  "# \u9879\u76EE\u624B\u518C",
  "",
  "## \u9879\u76EE\u603B\u89C8",
  "<!-- \u8FD9\u4E2A\u9879\u76EE\u5728\u505A\u4EC0\u4E48\u3001\u6280\u672F\u6808\u3001\u5173\u952E\u76EE\u5F55\uFF1B\u4E0D\u8D85\u8FC7 3 \u884C -->",
  "",
  "## \u51B3\u7B56\u8BB0\u5F55",
  "<!-- \u62CD\u677F\u8FC7\u7684\u5206\u53C9\u70B9\uFF1A\u9009\u4E86\u4EC0\u4E48\u3001\u4E3A\u4EC0\u4E48\u3001\u653E\u5F03\u4E86\u4EC0\u4E48\uFF1B\u6BCF\u6761\u4E0D\u8D85\u8FC7 2 \u884C -->",
  "",
  "## \u7EA6\u675F / \u7EA2\u7EBF",
  '<!-- \u672C\u9879\u76EE\u7EDD\u4E0D\u80FD\u505A\u7684\u4E8B\uFF1B\u53EA\u5199\u80FD\u5224\u5B9A\u7684\uFF0C\u4E0D\u5199"\u6CE8\u610F\u8D28\u91CF"\u8FD9\u7C7B\u7A7A\u8BDD -->',
  "",
  "## \u5751\u4E0E\u9632\u7EBF",
  "<!-- \u73B0\u8C61 \u2192 \u6839\u56E0 \u2192 \u9632\u7EBF \u2192 \u81EA\u67E5\uFF1B\u6BCF\u6761\u4E0D\u8D85\u8FC7 3 \u884C -->",
  ""
].join("\n");
var CHECK_EVIDENCE_MARK = " \uFF5C \u81EA\u68C0\uFF1A";
function parseChecklist(manual) {
  const lines = manual.split(/\r?\n/);
  let inSection = false;
  const items = [];
  for (const line of lines) {
    if (line.trim() === "## \u5B9E\u65BD\u987A\u5E8F") {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("## ")) break;
    if (!inSection) continue;
    const match = /^\s*-\s+\[([ xX])\]\s*(.+)$/.exec(line);
    if (match !== null) {
      const raw = (match[2] ?? "").trim();
      const cut = raw.indexOf(CHECK_EVIDENCE_MARK);
      items.push({ label: cut === -1 ? raw : raw.slice(0, cut).trim(), done: match[1] !== " " });
    }
  }
  return items;
}
function parseHasPlan(manual) {
  const lines = manual.split(/\r?\n/);
  let inPlan = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## \u65B9\u6848")) {
      inPlan = true;
      continue;
    }
    if (inPlan && trimmed.startsWith("## ")) break;
    if (!inPlan) continue;
    if (trimmed === "" || trimmed.startsWith("### ") || trimmed.startsWith("<!--")) continue;
    return true;
  }
  return false;
}
function headingText(line) {
  return line.replace(/^#+\s*/, "").trim();
}
function availableSections(manual) {
  return manual.split(/\r?\n/).filter((line) => line.startsWith("## ")).map(headingText);
}
function replaceSectionBody(manual, section, content, aliases = []) {
  const lines = manual.split(/\r?\n/);
  const candidates = [section, ...aliases];
  const start = lines.findIndex((line) => line.startsWith("## ") && candidates.some((candidate) => headingText(line).startsWith(candidate)));
  if (start < 0) {
    throw new Error(`\u624B\u518C\u91CC\u6CA1\u6709\u300C${section}\u300D\u5C0F\u8282\uFF1B\u53EF\u7528\u5C0F\u8282\uFF1A${availableSections(manual).join(" / ")}`);
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== void 0 && line.startsWith("## ")) {
      end = index;
      break;
    }
  }
  const head = lines.slice(0, start + 1);
  const tail = lines.slice(end);
  const body = content.trim();
  return [...head, "", body, "", ...tail].join("\n").replace(/\n{3,}/g, "\n\n");
}
var MANUAL_SECTION_ALIASES = {
  "\u5751\u4E0E\u9632\u7EBF": ["\u8981\u70B9"]
};
function splitManualSections(manual) {
  const sections = [];
  let current = null;
  for (const line of manual.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      if (current !== null) sections.push({ title: current.title, body: current.lines.join("\n").trim() });
      current = { title: headingText(line), lines: [] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  if (current !== null) sections.push({ title: current.title, body: current.lines.join("\n").trim() });
  return sections;
}
function appendSection(manual, section, content) {
  const base = manual.trimEnd();
  const body = content.trim();
  return `${base}

## ${section}

${body}
`;
}
function toggleChecklistLine(manual, label, done, evidence) {
  const lines = manual.split(/\r?\n/);
  let inSection = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === void 0) continue;
    if (line.trim() === "## \u5B9E\u65BD\u987A\u5E8F") {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("## ")) break;
    if (!inSection) continue;
    const match = /^(\s*-\s+\[)([ xX])(\]\s*)(.+)$/.exec(line);
    if (match === null || match[4] === void 0) continue;
    const raw = match[4].trim();
    const cut = raw.indexOf(CHECK_EVIDENCE_MARK);
    const lineLabel = cut === -1 ? raw : raw.slice(0, cut).trim();
    if (lineLabel !== label) continue;
    const suffix = done && evidence !== "" ? `${CHECK_EVIDENCE_MARK}${evidence}` : "";
    lines[index] = `${match[1] ?? ""}${done ? "x" : " "}${match[3] ?? ""}${label}${suffix}`;
    return lines.join("\n");
  }
  throw new Error(`\u6CA1\u80FD\u5B9A\u4F4D\u5230\u6761\u76EE\u300C${label}\u300D`);
}
async function writeTextAtomic(path2, content) {
  const tmp = `${path2}.${randomUUID2()}.tmp`;
  await fs2.writeFile(tmp, content, "utf8");
  await fs2.rename(tmp, path2);
}
async function writeIfMissing(path2, content) {
  try {
    await fs2.access(path2);
  } catch {
    await fs2.writeFile(path2, content, "utf8");
  }
}
async function readTextCapped(path2, maxBytes) {
  try {
    const raw = await fs2.readFile(path2, "utf8");
    if (Buffer.byteLength(raw, "utf8") <= maxBytes) return raw;
    return `${raw.slice(0, maxBytes)}
\u2026\uFF08\u5DF2\u622A\u65AD\uFF09`;
  } catch {
    return "";
  }
}
async function appendGitignore(workingDir) {
  if (typeof workingDir !== "string" || workingDir === "") return;
  const target = join(workingDir, ".gitignore");
  try {
    await fs2.access(target);
  } catch {
    return;
  }
  try {
    const content = await fs2.readFile(target, "utf8");
    if (content.includes(".workflow")) return;
    const separator = content !== "" && !content.endsWith("\n") ? "\n" : "";
    await fs2.writeFile(target, `${content}${separator}.workflow/
`, "utf8");
  } catch {
  }
}
var WorkflowRepository = class {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.storage = new JsonStorageAdapter(baseDir);
  }
  storage;
  /** 手册元数据缓存：key = workflowId:nodeId，按文件 mtime 失效，避免每次轮询都读盘。 */
  manualMetaCache = /* @__PURE__ */ new Map();
  /** 每个工作区的写队列（串行化读-改-写，避免并发覆盖丢更新）。 */
  writeQueues = /* @__PURE__ */ new Map();
  /**
   * 按 key（通常是 workflowId 或工作目录）串行执行写操作。
   * 前一个任务无论成功失败，后面的都会接着跑；返回本次任务的真实结果。
   */
  serial(key, task) {
    const previous = this.writeQueues.get(key) ?? Promise.resolve();
    const current = previous.then(task, task);
    this.writeQueues.set(key, current.catch(() => {
    }));
    return current;
  }
  /** 列出所有 workflow 工作区，按最后修改时间倒序。单个损坏文件跳过，不影响整体。 */
  async list() {
    const dir = join(this.baseDir, "workflows");
    let names = [];
    try {
      names = await fs2.readdir(dir);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const items = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      try {
        const snapshot = await this.storage.load(id);
        if (snapshot === null) continue;
        const stat = await fs2.stat(join(dir, name));
        items.push({
          id,
          title: snapshot.title,
          path: snapshot.working_directory ?? null,
          ...snapshot.host_workspace_id === void 0 ? {} : { workspaceId: snapshot.host_workspace_id },
          pinned: snapshot.pinned === true,
          updatedAt: stat.mtime.toISOString()
        });
      } catch {
      }
    }
    items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return items;
  }
  /** 新建一个 workflow 工作区：自动建根节点，标题缺省用目录名。 */
  async create(input) {
    const id = randomUUID2();
    const trimmedTitle = input.title?.trim() ?? "";
    const title = trimmedTitle !== "" ? trimmedTitle : basename(input.path);
    const hostWorkspaceId = typeof input.hostWorkspaceId === "string" && input.hostWorkspaceId !== "" ? input.hostWorkspaceId : void 0;
    const snapshot = {
      version: 2,
      workspace_id: id,
      title,
      working_directory: input.path,
      ...hostWorkspaceId === void 0 ? {} : { host_workspace_id: hostWorkspaceId },
      settings: DEFAULT_SETTINGS,
      nodes: [buildRootNode(id, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps)]
    };
    await this.storage.save(snapshot);
    await this.ensureGlobalManual(input.path);
    return {
      id,
      title,
      path: input.path,
      ...hostWorkspaceId === void 0 ? {} : { workspaceId: hostWorkspaceId },
      pinned: false,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async get(id) {
    return this.storage.load(id);
  }
  /** 读取某个 workflow 的全局操作细节（A + B/C/D）。 */
  async getGlobalOperationDetail(id) {
    const snapshot = await this.storage.load(id);
    return snapshot === null ? null : snapshot.settings.global_operation_detail;
  }
  /** 存档目录：一份存档 = 一个 json 文件；内置「默认存档」来自代码常量，不落盘。 */
  profilesDir() {
    return join(this.baseDir, "exports");
  }
  /** 当前生效存档的指针：只存一个名字，存在 <baseDir>/global-settings.json。 */
  activePointerPath() {
    return join(this.baseDir, "global-settings.json");
  }
  /** 存档名 → 文件名：去掉路径分隔符等非法字符并限长，防止写到目录外。 */
  profileFileName(name) {
    const safe = name.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/^\.+/, "").slice(0, 40);
    if (safe === "" || safe === BUILTIN_PROFILE_NAME) throw new Error(`\u5B58\u6863\u540D\u4E0D\u53EF\u7528\uFF1A${name}`);
    return `${safe}.json`;
  }
  /** 列出存档名（不含内置存档；读不出来的文件跳过，不让坏文件阻塞设置页）。 */
  async listProfileNames() {
    let entries = [];
    try {
      entries = await fs2.readdir(this.profilesDir());
    } catch {
      return [];
    }
    const names = [];
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith(".json")) continue;
      const name = entry.slice(0, -".json".length);
      if (name === BUILTIN_PROFILE_NAME) continue;
      try {
        const raw = JSON.parse(await fs2.readFile(join(this.profilesDir(), entry), "utf8"));
        GlobalOperationDetail.parse(raw?.detail ?? raw);
        names.push(name);
      } catch {
      }
    }
    return names.sort();
  }
  /** 当前生效存档名；指针失效时回到内置存档。 */
  async activeProfileName(names) {
    try {
      const raw = JSON.parse(await fs2.readFile(this.activePointerPath(), "utf8"));
      const active = typeof raw?.active === "string" ? raw.active : BUILTIN_PROFILE_NAME;
      if (active === BUILTIN_PROFILE_NAME) return active;
      return names.includes(active) ? active : BUILTIN_PROFILE_NAME;
    } catch {
      return BUILTIN_PROFILE_NAME;
    }
  }
  async writeActivePointer(name) {
    await fs2.mkdir(this.baseDir, { recursive: true });
    const target = this.activePointerPath();
    const tmp = `${target}.tmp`;
    await fs2.writeFile(tmp, `${JSON.stringify({ active: name }, null, 2)}
`, "utf8");
    await fs2.rename(tmp, target);
  }
  async writeProfileFile(name, detail) {
    await fs2.mkdir(this.profilesDir(), { recursive: true });
    const target = join(this.profilesDir(), this.profileFileName(name));
    const tmp = `${target}.tmp`;
    await fs2.writeFile(tmp, `${JSON.stringify({ kind: "dsh-agent-workflow/operation-detail", version: 1, name, detail }, null, 2)}
`, "utf8");
    await fs2.rename(tmp, target);
  }
  async readProfileFile(name) {
    const raw = JSON.parse(await fs2.readFile(join(this.profilesDir(), this.profileFileName(name)), "utf8"));
    return GlobalOperationDetail.parse(raw?.detail ?? raw);
  }
  /**
   * 一次性迁移：旧的 `{ active, profiles }` 或更早的扁平 A/B/C/D，都拆成"一份存档一个文件"。
   * 只在指针文件还是旧格式时动手，迁完就只剩 `{ active }`。
   */
  async migrateLegacySettings() {
    let raw;
    try {
      raw = JSON.parse(await fs2.readFile(this.activePointerPath(), "utf8"));
    } catch {
      return;
    }
    if (raw === null || typeof raw !== "object") return;
    const hasProfiles = raw.profiles !== null && typeof raw.profiles === "object";
    const isFlat = typeof raw.shared_detail === "string";
    if (!hasProfiles && !isFlat) return;
    const entries = hasProfiles ? Object.entries(raw.profiles) : [[MIGRATED_PROFILE_NAME, raw]];
    for (const [name, value] of entries) {
      if (name === BUILTIN_PROFILE_NAME) continue;
      const parsed = GlobalOperationDetail.safeParse(value);
      if (!parsed.success) continue;
      try {
        await this.writeProfileFile(name, parsed.data);
      } catch {
      }
    }
    const active = typeof raw.active === "string" ? raw.active : MIGRATED_PROFILE_NAME;
    await this.writeActivePointer(active);
  }
  /** 存档列表：内置存档永远排第一，其余按文件名排序。 */
  async listProfiles() {
    await this.migrateLegacySettings();
    const names = await this.listProfileNames();
    return { active: await this.activeProfileName(names), names: [BUILTIN_PROFILE_NAME, ...names] };
  }
  /** 当前生效的操作细节：内置存档来自代码常量，其余读对应的 json 文件。 */
  async getAppGlobalOperationDetail() {
    const { active } = await this.listProfiles();
    if (active === BUILTIN_PROFILE_NAME) return DEFAULT_GLOBAL_OPERATION_DETAIL;
    try {
      return await this.readProfileFile(active);
    } catch {
      return DEFAULT_GLOBAL_OPERATION_DETAIL;
    }
  }
  /** 保存当前生效的存档。内置存档只读，改它会被拒绝。 */
  async updateAppGlobalOperationDetail(raw) {
    const { active } = await this.listProfiles();
    if (active === BUILTIN_PROFILE_NAME) {
      throw new Error(`\u300C${BUILTIN_PROFILE_NAME}\u300D\u968F\u63D2\u4EF6\u63D0\u4F9B\u3001\u4E0D\u53EF\u4FEE\u6539\uFF1B\u8BF7\u5148\u300C\u53E6\u5B58\u4E3A\u300D\u4E00\u4EFD\u81EA\u5DF1\u7684\u5B58\u6863`);
    }
    const parsed = GlobalOperationDetail.parse(raw);
    await this.writeProfileFile(active, parsed);
    return parsed;
  }
  /** 新建/覆盖一份用户存档（内置存档名不可用）。detail 省略时复制当前生效的那份。 */
  async saveProfile(name, raw) {
    const trimmed = name.trim();
    if (trimmed === BUILTIN_PROFILE_NAME) throw new Error(`\u300C${BUILTIN_PROFILE_NAME}\u300D\u662F\u5185\u7F6E\u53EA\u8BFB\u5B58\u6863\uFF0C\u6362\u4E00\u4E2A\u540D\u5B57`);
    this.profileFileName(trimmed);
    const detail = raw === void 0 ? await this.getAppGlobalOperationDetail() : GlobalOperationDetail.parse(raw);
    await this.writeProfileFile(trimmed, detail);
    await this.writeActivePointer(trimmed);
    return this.listProfiles();
  }
  async activateProfile(name) {
    const names = await this.listProfileNames();
    if (name !== BUILTIN_PROFILE_NAME && !names.includes(name)) throw new Error(`\u6CA1\u6709\u540D\u4E3A\u300C${name}\u300D\u7684\u5B58\u6863`);
    await this.writeActivePointer(name);
    return this.listProfiles();
  }
  /** 删除存档：文件移进 exports/trash/（不直接删，误删可捞回来）。 */
  async deleteProfile(name) {
    if (name === BUILTIN_PROFILE_NAME) throw new Error(`\u300C${BUILTIN_PROFILE_NAME}\u300D\u662F\u5185\u7F6E\u53EA\u8BFB\u5B58\u6863\uFF0C\u4E0D\u80FD\u5220\u9664`);
    const names = await this.listProfileNames();
    if (!names.includes(name)) throw new Error(`\u6CA1\u6709\u540D\u4E3A\u300C${name}\u300D\u7684\u5B58\u6863`);
    const source = join(this.profilesDir(), this.profileFileName(name));
    const trash = join(this.profilesDir(), "trash");
    await fs2.mkdir(trash, { recursive: true });
    await fs2.rename(source, join(trash, `${this.profileFileName(name).replace(/\.json$/, "")}-${Date.now()}.json`));
    const active = await this.activeProfileName(await this.listProfileNames());
    if (active === name) await this.writeActivePointer(BUILTIN_PROFILE_NAME);
    return this.listProfiles();
  }
  /** 把当前生效的存档复制一份到存档目录（带时间戳），返回路径。 */
  async exportActiveProfile() {
    const { active } = await this.listProfiles();
    const detail = await this.getAppGlobalOperationDetail();
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const backupDir = join(this.profilesDir(), "backup");
    await fs2.mkdir(backupDir, { recursive: true });
    const target = join(backupDir, `\u64CD\u4F5C\u7EC6\u8282-${active}-${stamp}.json`);
    await fs2.writeFile(target, `${JSON.stringify({ kind: "dsh-agent-workflow/operation-detail", version: 1, name: active, detail }, null, 2)}
`, "utf8");
    return { path: target, name: active };
  }
  /**
   * 导入一份存档：接受 `{ name, detail }` 包装，或直接一份 A/B/C/D。
   * @returns 导入后的存档名与列表（不自动切换，避免导入即改全局行为）。
   */
  async importProfile(name, json) {
    let raw;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error("\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A\u8BF7\u7C98\u8D34\u5BFC\u51FA\u7684\u6587\u4EF6\u5185\u5BB9");
    }
    const detail = GlobalOperationDetail.parse(raw?.detail ?? raw);
    const trimmed = name.trim() !== "" ? name.trim() : typeof raw?.name === "string" ? raw.name : "\u5BFC\u5165\u7684\u5B58\u6863";
    if (trimmed === BUILTIN_PROFILE_NAME) throw new Error(`\u300C${BUILTIN_PROFILE_NAME}\u300D\u662F\u5185\u7F6E\u53EA\u8BFB\u5B58\u6863\uFF0C\u6362\u4E00\u4E2A\u540D\u5B57\u518D\u5BFC\u5165`);
    await this.writeProfileFile(trimmed, detail);
    const { names } = await this.listProfiles();
    return { imported: trimmed, names };
  }
  /** 覆盖某个 workflow 的全局操作细节（A + B/C/D），用 zod 校验后落盘。 */
  async updateGlobalOperationDetail(id, raw) {
    const snapshot = await this.storage.load(id);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const parsed = GlobalOperationDetail.parse(raw);
    const updated = {
      ...snapshot,
      settings: { ...snapshot.settings, global_operation_detail: parsed }
    };
    await this.storage.save(updated);
    return parsed;
  }
  /**
   * 设置节点级「附加说明」（纯增量，不覆盖全局）。
   * 传空串 = 删除该状态的附加说明；三个都空则把字段整个去掉。
   */
  async setNodeNote(input) {
    return this.serial(input.id, async () => {
      const snapshot = await this.storage.load(input.id);
      if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
      const state = input.state;
      if (!["global", "discussing", "implementing", "verifying"].includes(state)) throw new Error("\u975E\u6CD5\u72B6\u6001");
      const exists = snapshot.nodes.some((node) => node.node_id === input.nodeId);
      if (!exists) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
      const text = input.text.trim();
      const updated = {
        ...snapshot,
        nodes: snapshot.nodes.map((node) => {
          if (node.node_id !== input.nodeId) return node;
          const next = { ...node.additional_detail ?? {} };
          if (text === "") delete next[state];
          else next[state] = text;
          const hasAny = Object.keys(next).length > 0;
          const { additional_detail: _previous, ...rest } = node;
          return hasAny ? { ...rest, additional_detail: next } : rest;
        })
      };
      await this.storage.save(updated);
      return updated;
    });
  }
  /**
   * 按绑定的会话 id 反查节点（输入框旁的状态徽标用）。
   * workflow 数量很少，逐个文件扫一遍足够；单文件损坏就跳过。
   */
  async findBySession(sessionId) {
    const dir = join(this.baseDir, "workflows");
    let names = [];
    try {
      names = await fs2.readdir(dir);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      try {
        const snapshot = await this.storage.load(id);
        if (snapshot === null) continue;
        const node = snapshot.nodes.find((candidate) => candidate.session_id === sessionId);
        if (node !== void 0) {
          return {
            workflowId: id,
            nodeId: node.node_id,
            title: node.title ?? "",
            current_state: node.current_state
          };
        }
      } catch {
      }
    }
    return null;
  }
  /**
   * 删除整份 workflow 快照（宿主工作区被删除时同步清理，避免留下孤儿行）。
   * **不真删**：移到 workflows-trash/<id>.<时间戳>.json，便于误删后恢复。
   */
  async remove(id) {
    const source = join(this.baseDir, "workflows", `${id}.json`);
    const trashDir = join(this.baseDir, "workflows-trash");
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    try {
      await fs2.mkdir(trashDir, { recursive: true });
      await fs2.rename(source, join(trashDir, `${id}.${stamp}.json`));
      return;
    } catch (error) {
      if (error.code === "ENOENT") return;
      try {
        await fs2.unlink(source);
      } catch (unlinkError) {
        if (unlinkError.code === "ENOENT") return;
        throw unlinkError;
      }
    }
  }
  /** 列出回收站里的快照（按文件名倒序 = 最近删除优先）。 */
  async listTrash() {
    const trashDir = join(this.baseDir, "workflows-trash");
    let names = [];
    try {
      names = await fs2.readdir(trashDir);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    return names.filter((name) => name.endsWith(".json")).sort().reverse().map((name) => {
      const match = /^(.+)\.(\d{4}-\d{2}-\d{2}T[^.]+)\.json$/.exec(name);
      return {
        id: match?.[1] ?? name.slice(0, -".json".length),
        file: name,
        deletedAt: match?.[2] ?? ""
      };
    });
  }
  /**
   * 从回收站恢复（取该 id 最近一次删除的那份）。
   * 已存在同名快照时不覆盖，直接返回 false。
   */
  async restoreFromTrash(id) {
    const trashDir = join(this.baseDir, "workflows-trash");
    const target = join(this.baseDir, "workflows", `${id}.json`);
    try {
      await fs2.access(target);
      return false;
    } catch {
    }
    let names = [];
    try {
      names = await fs2.readdir(trashDir);
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
    const newest = names.filter((name) => name.startsWith(`${id}.`) && name.endsWith(".json")).sort().reverse()[0];
    if (newest === void 0) return false;
    await fs2.mkdir(join(this.baseDir, "workflows"), { recursive: true });
    await fs2.rename(join(trashDir, newest), target);
    return true;
  }
  /**
   * 把宿主目录工作区 id 写回快照（一次性迁移用：旧快照只有 working_directory）。
   * 已写过就不重复写；传空串等于清空。
   */
  async linkWorkspace(input) {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const hostWorkspaceId = input.hostWorkspaceId.trim();
    const updated = hostWorkspaceId === "" ? (() => {
      const { host_workspace_id: _removed, ...rest } = snapshot;
      return rest;
    })() : { ...snapshot, host_workspace_id: hostWorkspaceId };
    await this.storage.save(updated);
    return updated;
  }
  /** 置顶 / 取消置顶（只影响侧栏排序，不碰宿主的工作区置顶集合）。 */
  async setPinned(input) {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const updated = { ...snapshot, pinned: input.pinned === true };
    await this.storage.save(updated);
    return updated;
  }
  /** 把某个节点推进到下一状态；附状态迁移时间线（history）。 */
  async transitionNode(input) {
    return this.serial(input.id, async () => {
      const snapshot = await this.storage.load(input.id);
      if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
      const validStates = ["discussing", "implementing", "verifying", "completed"];
      if (!validStates.includes(input.to)) throw new Error("\u975E\u6CD5\u72B6\u6001");
      const node = snapshot.nodes.find((candidate) => candidate.node_id === input.nodeId);
      if (node === void 0) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
      const from = node.current_state;
      const updated = {
        ...snapshot,
        nodes: snapshot.nodes.map(
          (candidate) => candidate.node_id === input.nodeId ? {
            ...candidate,
            current_state: input.to,
            history: [...candidate.history ?? [], {
              at: (/* @__PURE__ */ new Date()).toISOString(),
              from,
              to: input.to,
              ...typeof input.by === "string" && input.by !== "" ? { by: input.by } : {}
            }]
          } : candidate
        )
      };
      await this.storage.save(updated);
      return updated;
    });
  }
  /**
   * 把节点绑定到一个 dsh 会话（点节点时打开）。
   * 传空字符串表示解绑；只改我们自己的快照，不碰宿主的会话存储。
   */
  async bindSession(input) {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    if (typeof input.sessionId !== "string") throw new Error("\u7F3A\u5C11 sessionId");
    const exists = snapshot.nodes.some((node) => node.node_id === input.nodeId);
    if (!exists) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
    const sessionId = input.sessionId.trim();
    const updated = {
      ...snapshot,
      nodes: snapshot.nodes.map((node) => {
        if (node.node_id !== input.nodeId) return node;
        if (sessionId === "") {
          const { session_id: _removed, ...rest } = node;
          return rest;
        }
        return { ...node, session_id: sessionId };
      })
    };
    await this.storage.save(updated);
    return updated;
  }
  /** 按工作目录反查 workflow 快照。 */
  async findByWorkingDirectory(workingDirectory) {
    const dir = join(this.baseDir, "workflows");
    let names = [];
    try {
      names = await fs2.readdir(dir);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      try {
        const snapshot = await this.storage.load(id);
        if (snapshot !== null && snapshot.working_directory === workingDirectory) return snapshot;
      } catch {
      }
    }
    return null;
  }
  /** 侧栏批量用：返回某工作区所有会话节点的状态映射（sessionId → current_state）。 */
  async getNodeStatesByDirectory(workingDirectory) {
    const snapshot = await this.findByWorkingDirectory(workingDirectory);
    if (snapshot === null) return {};
    const map = {};
    for (const node of snapshot.nodes) {
      if (typeof node.session_id === "string" && node.session_id !== "") {
        map[node.session_id] = node.current_state;
      }
    }
    return map;
  }
  /** 确保工作区根目录有项目手册（项目总览 / 决策 / 要点）。 */
  async ensureGlobalManual(workingDirectory) {
    if (typeof workingDirectory !== "string" || workingDirectory === "") return;
    const wfDir = join(workingDirectory, WORKFLOW_SUBDIR);
    await fs2.mkdir(wfDir, { recursive: true });
    await writeIfMissing(join(wfDir, globalManualFileName()), GLOBAL_MANUAL_TEMPLATE);
    await appendGitignore(workingDirectory);
  }
  /** 确保某目录是一个 workflow 工作区（没有快照就建，含根节点），返回快照。 */
  async ensureWorkflow(workingDirectory, title) {
    const existing = await this.findByWorkingDirectory(workingDirectory);
    if (existing !== null) return existing;
    const id = randomUUID2();
    const snapshot = {
      version: 2,
      workspace_id: id,
      title: title !== "" ? title : basename(workingDirectory),
      working_directory: workingDirectory,
      settings: DEFAULT_SETTINGS,
      nodes: [buildRootNode(id, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps)]
    };
    await this.storage.save(snapshot);
    await this.ensureGlobalManual(workingDirectory);
    return snapshot;
  }
  /**
   * 自动认领：确保某会话已经是 workflow 节点（没有就建），返回节点摘要。
   * 会话所属工作区 = workingDirectory；工作区还不是 workflow 就顺带建快照 + 项目手册。
   */
  async ensureNode(input) {
    const workingDirectory = input.workingDirectory.trim();
    if (workingDirectory === "") throw new Error("\u7F3A\u5C11\u5DE5\u4F5C\u76EE\u5F55");
    return this.serial(`dir:${workingDirectory}`, async () => {
      const snapshot = await this.ensureWorkflow(workingDirectory, "");
      const existing = snapshot.nodes.find((node) => node.session_id === input.sessionId);
      if (existing !== void 0) {
        return {
          workflowId: snapshot.workspace_id,
          nodeId: existing.node_id,
          title: existing.title ?? "",
          current_state: existing.current_state
        };
      }
      const nodeId = randomUUID2();
      const title = "\u65B0\u4F1A\u8BDD";
      const wfDir = join(workingDirectory, WORKFLOW_SUBDIR);
      await fs2.mkdir(wfDir, { recursive: true });
      await writeIfMissing(join(wfDir, sessionManualFileName(nodeId)), SESSION_MANUAL_TEMPLATE);
      const child = {
        ...buildRootNode(nodeId, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps),
        parent_id: null,
        title,
        node_type: "task",
        session_id: input.sessionId,
        depth: 0,
        // 新会话直接进「讨论中」：状态机里已经没有"未开始"这一态，也就没有"自动迁移"这条记录。
        current_state: "discussing"
      };
      const updated = { ...snapshot, nodes: [...snapshot.nodes, child] };
      await this.storage.save(updated);
      return { workflowId: snapshot.workspace_id, nodeId, title, current_state: child.current_state };
    });
  }
  /** 读会话手册全文 + 实施清单（供只读 UI 展示）；notesDir 指向 .workflow 根目录。 */
  async readNodeManual(workflowId, nodeId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) return null;
    const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
    if (node === void 0) return null;
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") return null;
    const wfDir = join(workingDir, WORKFLOW_SUBDIR);
    const manual = await readTextCapped(join(wfDir, sessionManualFileName(nodeId)), MANUAL_MAX_BYTES);
    return { manual, notesDir: wfDir, checklist: parseChecklist(manual) };
  }
  /** 读工作区项目手册（项目总览 / 决策 / 要点）。 */
  async readGlobalManual(workflowId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) return "";
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") return "";
    return readTextCapped(join(workingDir, WORKFLOW_SUBDIR, globalManualFileName()), GLOBAL_MANUAL_MAX_BYTES);
  }
  /**
   * 轻量取「实施清单 + 方案是否已写」：会话输入区每 3s 轮询用，带 mtime 缓存，
   * 文件没变就不重新读盘/解析。
   */
  async getManualMeta(workflowId, nodeId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) return null;
    const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
    if (node === void 0) return null;
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") return null;
    const file = join(workingDir, WORKFLOW_SUBDIR, sessionManualFileName(nodeId));
    let mtimeMs = 0;
    try {
      mtimeMs = (await fs2.stat(file)).mtimeMs;
    } catch {
    }
    const key = `${workflowId}:${nodeId}`;
    const cached = this.manualMetaCache.get(key);
    if (cached !== void 0 && cached.mtimeMs === mtimeMs) {
      return { checklist: cached.checklist, hasPlan: cached.hasPlan };
    }
    const manual = await readTextCapped(file, MANUAL_MAX_BYTES);
    const meta = { mtimeMs, checklist: parseChecklist(manual), hasPlan: parseHasPlan(manual) };
    this.manualMetaCache.set(key, meta);
    return { checklist: meta.checklist, hasPlan: meta.hasPlan };
  }
  /** 应用级设置（目前只有"切换状态时是否自动发送默认输入"）。存在 <baseDir>/app-settings.json。 */
  appSettingsPath() {
    return join(this.baseDir, "app-settings.json");
  }
  async getAppSettings() {
    try {
      const raw = JSON.parse(await fs2.readFile(this.appSettingsPath(), "utf8"));
      return { autoSendEnterTrigger: raw?.autoSendEnterTrigger === true };
    } catch {
      return { autoSendEnterTrigger: false };
    }
  }
  async updateAppSettings(patch) {
    const current = await this.getAppSettings();
    const next = {
      autoSendEnterTrigger: patch.autoSendEnterTrigger === void 0 ? current.autoSendEnterTrigger : patch.autoSendEnterTrigger === true
    };
    await fs2.mkdir(this.baseDir, { recursive: true });
    const target = this.appSettingsPath();
    const tmp = `${target}.tmp`;
    await fs2.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
    await fs2.rename(tmp, target);
    return next;
  }
  /**
   * 读项目手册并按四类内容拆开，供注入按优先级取用。
   * 旧标题「要点 / 疑难杂症」也算「坑与防线」。
   */
  async readGlobalManualSections(workflowId) {
    const manual = await this.readGlobalManual(workflowId);
    const sections = splitManualSections(manual);
    const pick = (prefixes) => sections.find((section) => prefixes.some((prefix) => section.title.startsWith(prefix)))?.body ?? "";
    return {
      overview: pick(["\u9879\u76EE\u603B\u89C8"]),
      decisions: pick(["\u51B3\u7B56\u8BB0\u5F55"]),
      constraints: pick(["\u7EA6\u675F"]),
      pitfalls: pick(["\u5751\u4E0E\u9632\u7EBF", "\u8981\u70B9"])
    };
  }
  /**
   * 读手册全文（AI 专用工具的 read 动作）。
   * nodeId 为 null 时读项目手册；否则读该会话的会话手册。
   */
  async readManual(workflowId, nodeId) {
    if (nodeId === null) return this.readGlobalManual(workflowId);
    const manual = await this.readNodeManual(workflowId, nodeId);
    return manual === null ? "" : manual.manual;
  }
  /**
   * 按小节替换手册正文（AI 专用工具的唯一写入口）。
   * 只改指定 `## 小节` 的正文，标题与其它小节原样保留；路径由这里拼，调用方不能指定。
   */
  async replaceManualSection(input) {
    const { file, isSession } = await this.resolveManualFile(input.workflowId, input.nodeId);
    const maxBytes = isSession ? MANUAL_MAX_BYTES : GLOBAL_MANUAL_MAX_BYTES;
    const current = await this.readFileOrTemplate(file, isSession);
    let next;
    try {
      next = replaceSectionBody(current, input.section, input.content, MANUAL_SECTION_ALIASES[input.section] ?? []);
    } catch (error) {
      if (isSession) throw error;
      next = appendSection(current, input.section, input.content);
    }
    const bytes = Buffer.byteLength(next, "utf8");
    if (bytes > maxBytes) {
      throw new Error(`\u5199\u5165\u540E\u624B\u518C\u4F1A\u53D8\u6210 ${bytes} \u5B57\u8282\uFF0C\u8D85\u8FC7\u4E0A\u9650 ${maxBytes} \u5B57\u8282\uFF1B\u8BF7\u7CBE\u7B80\u5185\u5BB9`);
    }
    await writeTextAtomic(file, next);
    this.manualMetaCache.delete(`${input.workflowId}:${input.nodeId ?? ""}`);
    return { bytes, section: input.section };
  }
  /**
   * 勾选 / 取消勾选「实施顺序」里的一条（按条目文字精确匹配，不许新增或改写条目）。
   * @returns 勾选后的完整清单，方便模型确认进度。
   */
  async setChecklistItem(input) {
    const evidence = typeof input.evidence === "string" ? input.evidence.trim() : "";
    if (input.done === true && evidence === "") {
      throw new Error("\u52FE\u9009\u9700\u8981 evidence\uFF1A\u5199\u6E05\u8FD9\u4E00\u5C42\u600E\u4E48\u9A8C\u7684\u3001\u7ED3\u679C\u662F\u4EC0\u4E48\uFF08\u4F8B\uFF1A\u8DD1 node test.mjs\uFF0C12 \u9879\u5168\u8FC7\uFF09\u3002");
    }
    const { file } = await this.resolveManualFile(input.workflowId, input.nodeId);
    const current = await this.readFileOrTemplate(file, true);
    const items = parseChecklist(current);
    if (items.length === 0) throw new Error("\u8FD9\u672C\u624B\u518C\u7684\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u91CC\u8FD8\u6CA1\u6709\u6761\u76EE\uFF0C\u5148\u7528 workflow_manual \u5199\u5165");
    const target = input.label.trim();
    const match = items.find((item) => item.label === target);
    if (match === void 0) {
      throw new Error(`\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u91CC\u6CA1\u6709\u300C${target}\u300D\u8FD9\u6761\uFF1B\u53EF\u52FE\u9009\u7684\u6761\u76EE\uFF1A${items.map((item) => item.label).join(" / ")}`);
    }
    const next = toggleChecklistLine(current, target, input.done, evidence);
    await writeTextAtomic(file, next);
    this.manualMetaCache.delete(`${input.workflowId}:${input.nodeId}`);
    return parseChecklist(next);
  }
  /** 会话/项目手册的绝对路径与"是不是会话手册"。 */
  async resolveManualFile(workflowId, nodeId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") throw new Error("\u8BE5 workflow \u6CA1\u6709\u5DE5\u4F5C\u76EE\u5F55");
    if (nodeId !== null) {
      const exists = snapshot.nodes.some((node) => node.node_id === nodeId);
      if (!exists) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
    }
    const wfDir = join(workingDir, WORKFLOW_SUBDIR);
    await fs2.mkdir(wfDir, { recursive: true });
    return {
      file: join(wfDir, nodeId === null ? globalManualFileName() : sessionManualFileName(nodeId)),
      isSession: nodeId !== null
    };
  }
  async readFileOrTemplate(file, isSession) {
    try {
      return await fs2.readFile(file, "utf8");
    } catch {
      return isSession ? SESSION_MANUAL_TEMPLATE : GLOBAL_MANUAL_TEMPLATE;
    }
  }
};

// src/engine/state-machine.ts
function effectiveDetail(targetState, node, global) {
  if (!isActiveState(targetState)) {
    return { full_detail: global.shared_detail, enter_trigger: null };
  }
  const target = targetState;
  const slot = global[target];
  const specific = node.state_detail_overrides?.[target] ?? slot;
  return {
    full_detail: `${global.shared_detail}

${specific.operation_detail}`,
    enter_trigger: specific.enter_trigger
  };
}

// src/schema/node-state-label.ts
var NODE_STATE_LABEL = {
  discussing: "\u8BA8\u8BBA\u4E2D",
  implementing: "\u5B9E\u73B0\u4E2D",
  verifying: "\u9A8C\u6536\u4E2D",
  completed: "\u5DF2\u5B8C\u7ED3"
};

// src/schema/hard-rules.ts
var DEFAULT_HARD_RULES = {
  discussing: `\uFF08\u6536\u5C3E\uFF09\u8BA8\u8BBA\u9636\u6BB5\u4E0D\u5199\u624B\u518C\u4E5F\u4E0D\u4F1A\u5361\u4F4F\uFF0C\u5199\u4E0D\u5199\u7531\u6211\u51B3\u5B9A\uFF1B\u53EA\u6709\u51C6\u5907\u63A8\u8FDB\u5230\u5B9E\u73B0\u4E2D\u65F6\uFF0C\u624D\u628A\u65B9\u6848\u6309\u300C\u76EE\u6807\u4E0E\u9A8C\u6536 \u2192 \u6570\u636E\u5C42 \u2192 \u9886\u57DF\u5C42 \u2192 \u63A5\u53E3\u5C42 \u2192 \u8868\u73B0\u5C42\u300D\u5199\u8FDB\u672C\u8282\u70B9\u4F1A\u8BDD\u624B\u518C\u7684\u300C\u65B9\u6848\u300D\u5C0F\u8282\uFF08\u6BCF\u5C42\u5199\u6E05\u5C42\u95F4\u5951\u7EA6\uFF09\uFF0C\u5E76\u5728\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u91CC\u5217\u51FA\u5F85\u529E\u3002\u63A8\u8FDB\u9700\u8981\u6211\u70B9\u540C\u610F\uFF0C\u4E0D\u8981\u81EA\u5DF1\u50AC\u3002`,
  implementing: `\uFF08\u7EAA\u5F8B\uFF09\u6309\u4F1A\u8BDD\u624B\u518C\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u4ECE\u4E0B\u5230\u4E0A\u8FDE\u7EED\u5B8C\u6210\u6240\u6709\u5C42\uFF1A\u6BCF\u5B8C\u6210\u4E00\u5C42\uFF0C\u6309\u8BE5\u5C42\u300C\u5B8C\u6210\u6807\u51C6\u300D\u81EA\u68C0\uFF0C\u7528 workflow_check \u628A\u8BC1\u636E\u5199\u8FDB\u6E05\u5355\uFF0C\u7136\u540E\u76F4\u63A5\u7EE7\u7EED\u4E0B\u4E00\u5C42\uFF0C\u4E0D\u8981\u9010\u5C42\u7B49\u6211\u786E\u8BA4\u3002\u53EA\u6709\u547D\u4E2D\u4EE5\u4E0B\u60C5\u51B5\u624D\u505C\u4E0B\u6765\u95EE\u6211\uFF1A\u2460 \u65B9\u6848\u6709\u6D1E\u6216\u81EA\u76F8\u77DB\u76FE\uFF0C\u9700\u8981\u6211\u62CD\u677F\uFF1B\u2461 \u8BE5\u5C42\u81EA\u68C0\u5931\u8D25\uFF0C\u4E14\u65E0\u6CD5\u5728\u672C\u5C42\u81EA\u884C\u4FEE\u590D\uFF1B\u2462 \u9700\u8981\u505A\u8D85\u51FA\u65B9\u6848\u8303\u56F4\u7684\u6539\u52A8\uFF1B\u2463 \u6D89\u53CA\u5220\u9664 / \u8986\u76D6\u4E0D\u53EF\u9006\u7684\u6570\u636E\u6216\u914D\u7F6E\uFF1B\u2464 \u9700\u8981\u6211\u63D0\u4F9B\u5916\u90E8\u8D44\u6E90\uFF08\u8D26\u53F7\u3001\u6587\u4EF6\u3001\u73AF\u5883\uFF09\u3002\u5168\u90E8\u5C42\u5B8C\u6210\u540E\uFF0C\u4E00\u6B21\u6027\u6C47\u62A5\u6BCF\u5C42\u505A\u4E86\u4EC0\u4E48\u3001\u600E\u4E48\u9A8C\u7684\u3001\u7ED3\u679C\u5982\u4F55\uFF0C\u7136\u540E\u8BF7\u6C42\u8FDB\u300C\u9A8C\u6536\u4E2D\u300D\u3002`,
  verifying: `\uFF08\u7EAA\u5F8B\uFF09\u9A8C\u6536\u5FC5\u987B\u7ED9\u53EF\u590D\u8DD1\u7684\u8BC1\u636E\uFF1A\u6BCF\u4E00\u9879\u300C\u901A\u8FC7\u300D\u90FD\u8981\u9644\u547D\u4EE4 + \u8F93\u51FA\uFF0C\u6216\u6307\u5411\u5177\u4F53\u6D4B\u8BD5\u6587\u4EF6\uFF08\u8DEF\u5F84 + \u8DD1\u6CD5\uFF09\uFF1B\u6CA1\u6709\u53EF\u590D\u8DD1\u8BC1\u636E\u7684\u9879\u6807\u300C\u672A\u9A8C\u8BC1\u300D\uFF0C\u4E0D\u7B97\u901A\u8FC7\u3002`
};

// src/host/event-log.ts
import { randomUUID as randomUUID3 } from "node:crypto";
var MAX_EVENTS = 500;
var events = [];
function newTraceId() {
  return `wf-${randomUUID3().slice(0, 8)}`;
}
function recordEvent(level, message, trace) {
  const entry = { at: (/* @__PURE__ */ new Date()).toISOString(), level, message };
  if (typeof trace === "string" && trace !== "") entry.trace = trace;
  events.push(entry);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}
function recentEvents(limit = 100) {
  const n = Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_EVENTS) : 100;
  return events.slice(-n);
}
function logEvent(logger, level, message, trace) {
  recordEvent(level, message, trace);
  if (level === "info") logger?.info?.(message);
  else logger?.warn?.(message);
}

// src/host/workflow-state-context.ts
import { join as join2 } from "node:path";
var MAX_TEXT_BYTES = 8e3;
var MANUAL_RECENT_CHARS = 2e3;
function truncateToBytes(text, maxBytes) {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0 && (buffer[end] & 192) === 128) end -= 1;
  return `${buffer.subarray(0, end).toString("utf8")}\u2026\uFF08\u5DF2\u622A\u65AD\uFF09`;
}
function registerWorkflowStateContext(ctx, repository, isWorkflowSession = () => true) {
  const cache = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Set();
  const buildText = async (sessionId) => {
    const found = await repository.findBySession(sessionId);
    if (found === null || found === void 0) {
      cache.delete(sessionId);
      logEvent(ctx.logger, "info", `[workflow] context cleared (session=${sessionId}, reason=no-node)`);
      return "";
    }
    const snapshot = await repository.get(found.workflowId);
    if (snapshot === null) {
      cache.delete(sessionId);
      logEvent(ctx.logger, "info", `[workflow] context cleared (session=${sessionId}, reason=no-workflow)`);
      return "";
    }
    const node = snapshot.nodes.find((candidate) => candidate.node_id === found.nodeId);
    if (node === void 0) {
      cache.delete(sessionId);
      logEvent(ctx.logger, "info", `[workflow] context cleared (session=${sessionId}, reason=no-node-in-snapshot)`);
      return "";
    }
    const global = await repository.getAppGlobalOperationDetail();
    const effective = effectiveDetail(node.current_state, node, global);
    const label = NODE_STATE_LABEL[node.current_state] ?? node.current_state;
    const parts = [
      "<workflow-state>",
      `\u8282\u70B9\uFF1A${node.title || "(\u672A\u547D\u540D)"}\u3000workflow\uFF1A${snapshot.title}`,
      `\u5F53\u524D\u72B6\u6001\uFF1A${label}`,
      "\uFF08\u9636\u6BB5\u8FB9\u754C\uFF1A\u53EA\u6709\u300C\u8BA8\u8BBA\u4E2D\u300D\u4F1A\u62E6\u5199\u64CD\u4F5C\uFF1B\u300C\u9A8C\u6536\u4E2D\u300D\u300C\u5DF2\u5B8C\u7ED3\u300D\u4E0D\u62E6\u5199\u6587\u4EF6\u3002\u6539\u4EE3\u7801\u4ECD\u6309\u9636\u6BB5\u89C4\u5219\u8D70\uFF0C\u5DE5\u5177\u4F1A\u8FD4\u56DE\u8BE5\u9636\u6BB5\u7684\u5B8C\u6574\u89C4\u5219\u3002\uFF09"
    ];
    if (typeof effective.full_detail === "string" && effective.full_detail.trim() !== "") {
      parts.push("", effective.full_detail.trim());
    }
    const hardOverride = (global && typeof global === "object" ? global.hard_rules : void 0) ?? {};
    const hardRule = node.current_state === "discussing" ? hardOverride.discussing ?? DEFAULT_HARD_RULES.discussing : node.current_state === "implementing" ? hardOverride.implementing ?? DEFAULT_HARD_RULES.implementing : node.current_state === "verifying" ? hardOverride.verifying ?? DEFAULT_HARD_RULES.verifying : "";
    if (typeof hardRule === "string" && hardRule.trim() !== "") {
      parts.push("", `\u3010\u672C\u9636\u6BB5\u786C\u89C4\u5219\u3011
${hardRule.trim()}`);
    }
    const nodeAdditional = typeof node.additional_detail === "object" && node.additional_detail !== null ? node.additional_detail.global : void 0;
    if (typeof nodeAdditional === "string" && nodeAdditional.trim() !== "") {
      parts.push("", nodeAdditional.trim());
    }
    const addition = typeof node.additional_detail === "object" && node.additional_detail !== null ? node.additional_detail[node.current_state] : void 0;
    if (typeof addition === "string" && addition.trim() !== "") {
      parts.push("", `\u672C\u8282\u70B9\u8865\u5145\u8981\u6C42\uFF1A${addition.trim()}`);
    }
    const manualData = await repository.readNodeManual(found.workflowId, found.nodeId);
    if (manualData !== null) {
      const manual = manualData.manual;
      const recent = manual.length > MANUAL_RECENT_CHARS ? `${manual.slice(-MANUAL_RECENT_CHARS)}
\u2026\uFF08\u66F4\u65E9\u5185\u5BB9\u89C1\u6587\u4EF6\uFF09` : manual;
      parts.push("", `\u672C\u4F1A\u8BDD\u624B\u518C\uFF1A${join2(manualData.notesDir, `\u4F1A\u8BDD\u624B\u518C-${found.nodeId}.md`)}`);
      if (recent.trim() !== "") parts.push(recent);
    }
    const projectSections = await repository.readGlobalManualSections(found.workflowId);
    const clip = (text2, max) => text2.length > max ? `${text2.slice(0, max)}\u2026` : text2;
    const projectBlocks = [];
    if (projectSections.constraints.trim() !== "") projectBlocks.push(`\u3010\u7EA6\u675F / \u7EA2\u7EBF\u3011
${clip(projectSections.constraints, 300)}`);
    if (projectSections.pitfalls.trim() !== "") projectBlocks.push(`\u3010\u5751\u4E0E\u9632\u7EBF\u3011
${clip(projectSections.pitfalls, 400)}`);
    if (projectSections.overview.trim() !== "") projectBlocks.push(`\u3010\u9879\u76EE\u603B\u89C8\u3011
${clip(projectSections.overview, 120)}`);
    if (projectSections.decisions.trim() !== "") projectBlocks.push(`\u3010\u51B3\u7B56\u8BB0\u5F55\u3011
${clip(projectSections.decisions, 160)}`);
    if (projectBlocks.length > 0) parts.push("", "\u9879\u76EE\u624B\u518C\uFF1A", projectBlocks.join("\n\n"));
    parts.push("", "\u6536\u5C3E\u65F6\u56DE\u7B54\u56DB\u95EE\u5E76\u5199\u8FDB\u9879\u76EE\u624B\u518C\uFF1A\u2460 \u672C\u6B21\u65B0\u589E\u6216\u63A8\u7FFB\u4E86\u4EC0\u4E48\u51B3\u7B56\uFF08\u5199\u300C\u51B3\u7B56\u8BB0\u5F55\u300D\uFF09\uFF1B\u2461 \u8E29\u5230\u6216\u590D\u73B0\u4E86\u4EC0\u4E48\u5751\uFF08\u5199\u300C\u5751\u4E0E\u9632\u7EBF\u300D\uFF0C\u6309\u300C\u73B0\u8C61 \u2192 \u6839\u56E0 \u2192 \u9632\u7EBF \u2192 \u81EA\u67E5\u300D\uFF09\uFF1B\u2462 \u4E24\u6837\u90FD\u6CA1\u6709\u5C31\u5199\u300C\u65E0\u300D\uFF1B\u2463 \u624B\u518C/\u6587\u6863\u63CF\u8FF0\u4E0E\u5B9E\u73B0\u662F\u5426\u4E00\u81F4\uFF0C\u4E0D\u4E00\u81F4\u6539\u4E86\u4EC0\u4E48\u3002\u540C\u65F6\u540C\u6B65\u672C\u4F1A\u8BDD\u624B\u518C\u7684\u300C\u65B9\u6848\u300D\u4E0E\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u3002");
    parts.push("</workflow-state>");
    const text = truncateToBytes(parts.join("\n"), MAX_TEXT_BYTES);
    cache.set(sessionId, { text, nodeId: node.node_id, state: node.current_state });
    return text;
  };
  const refresh = (sessionId) => {
    if (typeof sessionId !== "string" || sessionId === "" || pending.has(sessionId)) return;
    if (!isWorkflowSession(sessionId)) return;
    pending.add(sessionId);
    void buildText(sessionId).catch((error) => {
      logEvent(ctx.logger, "warn", `workflow state context refresh failed (session=${sessionId}): %o ${String(error)}`);
    }).finally(() => pending.delete(sessionId));
  };
  const readText = (sessionId) => {
    if (typeof sessionId !== "string" || sessionId === "") return "";
    if (!isWorkflowSession(sessionId)) return "";
    const entry = cache.get(sessionId);
    if (entry !== void 0) return entry.text;
    logEvent(ctx.logger, "info", `[workflow] context cold (session=${sessionId})`);
    refresh(sessionId);
    return "";
  };
  ctx.on("agent/pre-step", async (_payload, next) => {
    const payload = _payload ?? {};
    const sessionId = payload.agent?.session?.id;
    if (typeof sessionId === "string") refresh(sessionId);
    return next();
  });
  ctx.on("agent/created", function(payload) {
    const sessionId = payload?.agent?.session?.id;
    if (typeof sessionId !== "string" || sessionId === "") return;
    if (!isWorkflowSession(sessionId)) return;
    logEvent(ctx.logger, "info", `[workflow] context registered (session=${sessionId})`);
    refresh(sessionId);
    if (typeof this?.systemPrompt?.context !== "function") return;
    this.systemPrompt.context({
      name: "workflow:state",
      order: 150,
      text: () => readText(sessionId)
    });
  });
  ctx.inject(["systemPrompt"], (scoped) => {
    scoped.effect(() => scoped.systemPrompt.context({
      name: "workflow:state",
      order: 150,
      text: (assemblyContext) => readText(pickSessionId(assemblyContext))
    }));
  });
  return {
    /** 强制算一次并返回（调试/预览用）。 */
    peek: async (sessionId) => buildText(sessionId),
    /** 立刻重算并等它完成：状态推进后调用，保证下一轮模型请求看到的就是新状态。 */
    refreshNow: async (sessionId) => {
      const startedAt = Date.now();
      const text = await buildText(sessionId);
      logEvent(ctx.logger, "info", `[workflow] state-context ok (session=${sessionId}, bytes=${Buffer.byteLength(text, "utf8")}, ${Date.now() - startedAt}ms)`);
      return text;
    }
  };
}
function pickSessionId(context) {
  const candidates = [
    context?.sessionId,
    context?.session?.id,
    context?.agent?.session?.id,
    context?.scope?.session?.id,
    context?.scope?.agent?.session?.id
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate !== "") return candidate;
  }
  return "";
}

// src/host/workflow-tools.ts
var SIDE_EFFECT_TOOLS = /* @__PURE__ */ new Set(["write", "edit", "apply_patch", "pwsh", "bash", "notebook"]);
var ALLOWED_TRANSITIONS = {
  discussing: ["implementing"],
  implementing: ["verifying", "discussing"],
  verifying: ["completed", "implementing", "discussing"],
  completed: ["implementing", "discussing"]
};
var STATE_ORDER = ["discussing", "implementing", "verifying", "completed"];
var WRITABLE_SECTIONS = {
  session: ["\u65B9\u6848", "\u5B9E\u65BD\u987A\u5E8F"],
  project: ["\u9879\u76EE\u603B\u89C8", "\u51B3\u7B56\u8BB0\u5F55", "\u7EA6\u675F", "\u5751\u4E0E\u9632\u7EBF"]
};
function labelOf(state) {
  return NODE_STATE_LABEL[state] ?? state;
}
function denialFor(state, toolName) {
  if (state !== "discussing") return void 0;
  return `\u5F53\u524D\u72B6\u6001\u662F\u300C\u8BA8\u8BBA\u4E2D\u300D\uFF0C\u4E0D\u5141\u8BB8\u6267\u884C ${toolName}\uFF1A\u8BA8\u8BBA\u9636\u6BB5\u53EA\u51FA\u65B9\u6848\u3001\u4E0D\u6539\u4EE3\u7801\u3002\u5148\u8C03\u7528 workflow_advance({ to: "implementing" }) \u63A8\u8FDB\u5230\u300C\u5B9E\u73B0\u4E2D\u300D\uFF08\u9700\u8981\u5148\u628A\u65B9\u6848\u5199\u8FDB\u4F1A\u8BDD\u624B\u518C\uFF09\uFF0C\u6216\u8BF7\u7528\u6237\u70B9\u72B6\u6001\u80F6\u56CA\u7684 \u2192\u3002`;
}
function registerWorkflowGuard(ctx, deps) {
  ctx.inject(["tools"], (toolCtx) => {
    toolCtx.effect(() => toolCtx.tools.guard((exec) => {
      const sessionId = exec?.agent?.session?.id;
      if (!deps.isPresetSession(sessionId)) return void 0;
      const toolName = String(exec?.name ?? "");
      if (!SIDE_EFFECT_TOOLS.has(toolName)) return void 0;
      const state = deps.getState(sessionId);
      if (state === void 0) {
        logEvent(ctx.logger, "info", `[workflow] guard skipped (session=${sessionId}, tool=${toolName}, reason=unknown-state)`);
        return void 0;
      }
      const reason = denialFor(state, toolName);
      if (reason !== void 0) {
        logEvent(ctx.logger, "info", `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=${state})`);
      }
      return reason;
    }));
  });
}
function registerWorkflowTools(ctx, deps) {
  ctx.inject(["tools"], (toolCtx) => {
    const whenWorkflow = (context) => deps.isPresetSession(context?.agent?.session?.id);
    const instrument = async (toolName, sessionId, run) => {
      const startedAt = Date.now();
      try {
        const value = await run();
        logEvent(ctx.logger, "info", `[workflow] tool ${toolName} ok (session=${sessionId}, ${Date.now() - startedAt}ms)`);
        return value;
      } catch (error) {
        const message = String(error?.message ?? error);
        logEvent(ctx.logger, "warn", `[workflow] tool ${toolName} failed (session=${sessionId}, ${Date.now() - startedAt}ms): ${message}`);
        throw error;
      }
    };
    toolCtx.effect(() => toolCtx.tools.register({
      name: "workflow_advance",
      description: "Request a stage change for this workflow session. This tool does NOT change the stage: it validates the preconditions and leaves a request the user must approve in the session UI (a \u540C\u610F / \u62D2\u7EDD control appears next to the state badge). Call it when the user agrees to move on: \u8BA8\u8BBA\u4E2D\u2192\u5B9E\u73B0\u4E2D before writing any code (the session manual must contain a plan), \u5B9E\u73B0\u4E2D\u2192\u9A8C\u6536\u4E2D when every checklist item is checked. Only available in sessions using the workflow preset.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["to"],
        properties: {
          to: {
            type: "string",
            enum: ["discussing", "implementing", "verifying", "completed"],
            description: "Requested stage. Forward = normal progression; backward = rework."
          },
          reason: {
            type: "string",
            description: "Required when moving backward (rework): why the previous stage was insufficient."
          }
        }
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["requested", "status", "message"],
          properties: {
            requested: { type: "string" },
            status: { type: "string" },
            message: { type: "string" }
          }
        },
        render: (_args, value) => [
          { type: "text", text: `\u5DF2\u8BF7\u6C42\u5207\u6362\u5230\u300C${labelOf(value.requested)}\u300D\uFF0C\u7B49\u5F85\u7528\u6237\u786E\u8BA4\u3002` }
        ]
      },
      execute: async (args, exec) => {
        const sessionId = requireSession(deps, exec);
        return instrument("workflow_advance", sessionId, async () => {
          const found = await deps.repository.findBySession(sessionId);
          if (found === null) throw new Error("\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 workflow \u8282\u70B9");
          const from = String(found.current_state);
          const to = String(args?.to ?? "");
          const allowed = ALLOWED_TRANSITIONS[from] ?? [];
          if (!allowed.includes(to)) {
            throw new Error(`\u4E0D\u80FD\u4ECE\u300C${labelOf(from)}\u300D\u76F4\u63A5\u5230\u300C${labelOf(to)}\u300D\uFF1B\u5F53\u524D\u53EF\u53BB\uFF1A${allowed.map(labelOf).join(" / ")}`);
          }
          const backward = STATE_ORDER.indexOf(to) < STATE_ORDER.indexOf(from);
          if (backward && (typeof args?.reason !== "string" || args.reason.trim() === "")) {
            throw new Error("\u8FD4\u5DE5\u9700\u8981 reason\uFF1A\u8BF4\u660E\u4E0A\u4E00\u9636\u6BB5\u54EA\u91CC\u4E0D\u591F");
          }
          await assertAdvanceAllowed(deps.repository, found, from, to);
          deps.requestAdvance({ sessionId, to, ...typeof args?.reason === "string" ? { reason: args.reason } : {} });
          logEvent(ctx.logger, "info", `[workflow] advance requested (session=${sessionId}, ${from}\u2192${to}${backward ? ", rework" : ""})`);
          return {
            requested: to,
            status: "awaiting-approval",
            message: `\u5DF2\u8BF7\u6C42\u4ECE\u300C${labelOf(from)}\u300D\u5207\u6362\u5230\u300C${labelOf(to)}\u300D\uFF0C\u7B49\u5F85\u7528\u6237\u5728\u4F1A\u8BDD\u91CC\u786E\u8BA4\uFF1B\u540C\u610F\u4E4B\u524D\u72B6\u6001\u4E0D\u4F1A\u53D8\u3002`
          };
        });
      }
    }, { when: whenWorkflow }));
    toolCtx.effect(() => toolCtx.tools.register({
      name: "workflow_manual",
      description: "Read or update this workflow session's manual. target=session edits \u4F1A\u8BDD\u624B\u518C (writable section: \u65B9\u6848); target=project edits \u9879\u76EE\u624B\u518C (writable sections: \u9879\u76EE\u603B\u89C8 / \u51B3\u7B56\u8BB0\u5F55 / \u8981\u70B9). Replaces one section body only \u2014 headings and other sections are preserved, and the \u5B9E\u65BD\u987A\u5E8F checklist cannot be edited here (use workflow_check). Allowed in every stage.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["target", "action"],
        properties: {
          target: { type: "string", enum: ["session", "project"], description: "Which manual to touch." },
          action: { type: "string", enum: ["read", "replace_section"], description: "read returns the text; replace_section rewrites one section body." },
          section: { type: "string", description: "Section name for replace_section (e.g. \u65B9\u6848 / \u9879\u76EE\u603B\u89C8 / \u51B3\u7B56\u8BB0\u5F55 / \u8981\u70B9)." },
          content: { type: "string", description: "New body for that section (markdown, without the heading)." }
        }
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: {
            ok: { type: "boolean" },
            text: { type: "string" },
            bytes: { type: "integer" },
            section: { type: "string" }
          }
        },
        render: (args, value) => [
          { type: "text", text: args?.action === "read" ? `\u624B\u518C\u5171 ${value.text?.length ?? 0} \u5B57` : `\u5DF2\u66F4\u65B0\u300C${value.section}\u300D\u5C0F\u8282\uFF08${value.bytes} \u5B57\u8282\uFF09` }
        ]
      },
      execute: async (args, exec) => {
        const sessionId = requireSession(deps, exec);
        return instrument("workflow_manual", sessionId, async () => {
          const found = await deps.repository.findBySession(sessionId);
          if (found === null) throw new Error("\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 workflow \u8282\u70B9");
          const target = String(args?.target ?? "");
          if (target !== "session" && target !== "project") throw new Error("target \u53EA\u80FD\u662F session \u6216 project");
          const action = String(args?.action ?? "");
          const nodeId = target === "session" ? found.nodeId : null;
          if (action === "read") {
            const text = await deps.repository.readManual(found.workflowId, nodeId);
            return { ok: true, text };
          }
          if (action !== "replace_section") throw new Error("action \u53EA\u80FD\u662F read \u6216 replace_section");
          const section = String(args?.section ?? "").trim();
          const writable = WRITABLE_SECTIONS[target];
          if (!writable.includes(section)) {
            throw new Error(`\u300C${target}\u300D\u624B\u518C\u53EA\u80FD\u6539\u8FD9\u4E9B\u5C0F\u8282\uFF1A${writable.join(" / ")}\uFF1B${section === "\u5B9E\u65BD\u987A\u5E8F" ? "\u6E05\u5355\u8BF7\u7528 workflow_check \u52FE\u9009\u3002" : ""}`);
          }
          if (typeof args?.content !== "string" || args.content.trim() === "") throw new Error("content \u4E0D\u80FD\u4E3A\u7A7A");
          if (target === "session" && section === "\u5B9E\u65BD\u987A\u5E8F") {
            const state = deps.getState(sessionId);
            if (state !== "discussing") {
              throw new Error("\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u53EA\u80FD\u5728\u300C\u8BA8\u8BBA\u4E2D\u300D\u5B9A\u4E49\uFF1B\u8FDB\u5165\u5B9E\u73B0\u4E2D\u4E4B\u540E\u8BF7\u7528 workflow_check \u9010\u6761\u52FE\u9009\uFF0C\u4E0D\u8981\u6539\u5199\u6761\u76EE\u3002");
            }
          }
          const result = await deps.repository.replaceManualSection({ workflowId: found.workflowId, nodeId, section, content: args.content });
          logEvent(ctx.logger, "info", `[workflow] manual write (session=${sessionId}, target=${target}, section=${section}, bytes=${result.bytes})`);
          return { ok: true, bytes: result.bytes, section };
        });
      }
    }, { when: whenWorkflow }));
    toolCtx.effect(() => toolCtx.tools.register({
      name: "workflow_check",
      description: "Check or uncheck ONE item in this workflow session's \u5B9E\u65BD\u987A\u5E8F checklist. The item text must match an existing line exactly \u2014 this tool never adds, rewords, or reorders items. Checking an item REQUIRES evidence: say how you verified this layer and what the result was; the evidence is written into the checklist line. Every item must be checked (with evidence) before the session can move to \u9A8C\u6536\u4E2D. Not available in \u8BA8\u8BBA\u4E2D.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["item", "done"],
        properties: {
          item: { type: "string", description: "Exact text of an existing checklist item." },
          done: { type: "boolean", description: "true = checked, false = unchecked." },
          evidence: { type: "string", description: "\u52FE\u9009\u65F6\u5FC5\u586B\uFF1A\u8FD9\u4E00\u5C42\u600E\u4E48\u9A8C\u7684\u3001\u7ED3\u679C\u662F\u4EC0\u4E48\uFF08\u81EA\u7531\u6587\u672C\uFF0C\u4F8B\uFF1A\u8DD1 node test.mjs\uFF0C12 \u9879\u5168\u8FC7\uFF09\u3002\u53D6\u6D88\u52FE\u9009\u53EF\u7701\u7565\u3002" }
        }
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["items"],
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "done"],
                properties: {
                  label: { type: "string" },
                  done: { type: "boolean" }
                }
              }
            }
          }
        },
        render: (_args, value) => [
          { type: "text", text: `\u6E05\u5355\u8FDB\u5EA6\uFF1A${value.items.filter((item) => item.done).length}/${value.items.length}` }
        ]
      },
      execute: async (args, exec) => {
        const sessionId = requireSession(deps, exec);
        return instrument("workflow_check", sessionId, async () => {
          const state = deps.getState(sessionId);
          if (state === "discussing") throw new Error("\u300C\u8BA8\u8BBA\u4E2D\u300D\u8FD8\u4E0D\u52FE\u6E05\u5355\uFF1A\u5148\u628A\u65B9\u6848\u5199\u8FDB\u4F1A\u8BDD\u624B\u518C\uFF0C\u63A8\u8FDB\u5230\u300C\u5B9E\u73B0\u4E2D\u300D\u518D\u52FE\u3002");
          const found = await deps.repository.findBySession(sessionId);
          if (found === null) throw new Error("\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 workflow \u8282\u70B9");
          const label = String(args?.item ?? "").trim();
          if (label === "") throw new Error("item \u4E0D\u80FD\u4E3A\u7A7A");
          const items = await deps.repository.setChecklistItem({
            workflowId: found.workflowId,
            nodeId: found.nodeId,
            label,
            done: args?.done === true,
            evidence: typeof args?.evidence === "string" ? args.evidence : ""
          });
          return { items };
        });
      }
    }, { when: whenWorkflow }));
  });
}
function requireSession(deps, exec) {
  const sessionId = exec?.agent?.session?.id;
  if (typeof sessionId !== "string" || sessionId === "") throw new Error("\u8FD9\u4E2A\u5DE5\u5177\u9700\u8981\u4E00\u4E2A\u4F1A\u8BDD");
  if (!deps.isPresetSession(sessionId)) throw new Error("\u8FD9\u4E2A\u5DE5\u5177\u53EA\u5BF9\u300C\u5DE5\u4F5C\u6D41\u6A21\u5F0F\u300D\u9884\u8BBE\u7684\u4F1A\u8BDD\u53EF\u7528");
  return sessionId;
}
async function assertAdvanceAllowed(repository, found, from, to) {
  if (to === "implementing" && from === "discussing") {
    const meta = await repository.getManualMeta(found.workflowId, found.nodeId);
    if (meta === null || meta.hasPlan !== true) {
      throw new Error(
        '\u4F1A\u8BDD\u624B\u518C\u7684\u300C\u65B9\u6848\u300D\u8FD8\u662F\u7A7A\u7684\uFF1A\u5148\u7528 workflow_manual({ target: "session", action: "replace_section", section: "\u65B9\u6848", content: "..." }) \u5199\u5165\u65B9\u6848\uFF0C\u518D\u63A8\u8FDB\u5230\u300C\u5B9E\u73B0\u4E2D\u300D\u3002'
      );
    }
  }
  if (to === "verifying") {
    const meta = await repository.getManualMeta(found.workflowId, found.nodeId);
    const items = meta?.checklist ?? [];
    if (items.length === 0) {
      throw new Error("\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u91CC\u8FD8\u6CA1\u6709\u6761\u76EE\uFF1A\u5148\u7528 workflow_manual \u5199\u5165\u65B9\u6848\u548C\u5B9E\u65BD\u987A\u5E8F\uFF0C\u518D\u9010\u6761\u7528 workflow_check \u52FE\u9009\u3002");
    }
    const unchecked = items.filter((item) => item.done !== true);
    if (unchecked.length > 0) {
      throw new Error(`\u8FD8\u6709 ${unchecked.length} \u6761\u6CA1\u52FE\u5B8C\uFF0C\u4E0D\u80FD\u8FDB\u300C\u9A8C\u6536\u4E2D\u300D\uFF1A${unchecked.map((item) => item.label).join(" / ")}`);
    }
  }
}

// src/host.ts
var inject = [];
function resolveDataDir() {
  const profileDir = process.env.DSH_PROFILE_DIR;
  const base = profileDir && profileDir.trim() !== "" ? profileDir : join3(homedir(), ".dsh");
  return join3(base, "dsh-agent-workflow");
}
function isLoopbackRequest(req) {
  try {
    const host = String(req?.headers?.host ?? "");
    return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
  } catch {
    return false;
  }
}
function denyRequest(res) {
  try {
    res.statusCode = 403;
    res.end("forbidden");
  } catch {
  }
}
function sendJson(res, status, value) {
  try {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(value));
  } catch {
  }
}
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("\u8BF7\u6C42\u4F53\u8FC7\u5927"));
        req.destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("JSON \u89E3\u6790\u5931\u8D25"));
      }
    });
    req.on("error", reject);
  });
}
function routeNameOf(req) {
  const routePath = String(req?.url ?? "").split("?")[0];
  return routePath.replace(/^\/dsh-agent-workflow\//, "") || "(root)";
}
function makeHandler(ctx, repository, method, run) {
  return async (req, res) => {
    if (!isLoopbackRequest(req)) return denyRequest(res);
    if (req.method !== method) return sendJson(res, 405, { ok: false, error: `\u53EA\u63A5\u53D7 ${method}` });
    const traceId = newTraceId();
    const routeName = routeNameOf(req);
    const startedAt = Date.now();
    let body = {};
    let query = new URLSearchParams();
    try {
      if (req.method === "POST") body = await readJsonBody(req);
      const rawQuery = String((req.url ?? "").split("?")[1] ?? "");
      query = new URLSearchParams(rawQuery);
    } catch (error) {
      const message = String(error.message ?? error);
      logEvent(ctx.logger, "warn", `[workflow] route rejected (route=${routeName}, trace=${traceId}, ${Date.now() - startedAt}ms): ${message}`, traceId);
      return sendJson(res, 400, { ok: false, error: message, traceId });
    }
    try {
      const value = await run(body, query, traceId);
      sendJson(res, 200, { ok: true, traceId, ...value });
    } catch (error) {
      const message = String(error?.message ?? error);
      logEvent(ctx.logger, "warn", `[workflow] route failed (route=${routeName}, trace=${traceId}, ${Date.now() - startedAt}ms): ${message}`, traceId);
      sendJson(res, 500, { ok: false, error: message, traceId });
    }
  };
}
function apply(ctx) {
  const repository = new WorkflowRepository(resolveDataDir());
  const WORKFLOW_PRESET_ID = "workflow";
  const presetSessions = /* @__PURE__ */ new Set();
  const presetIdOf = (agentCtx) => {
    try {
      const registry = ctx.get("agentPresets");
      if (registry === void 0 || agentCtx === void 0) return null;
      return registry.composedPreset(agentCtx) ?? null;
    } catch {
      return null;
    }
  };
  const isPresetSession = (sessionId) => typeof sessionId === "string" && presetSessions.has(sessionId);
  const claim = (agent) => {
    const sessionId = agent?.session?.id;
    if (typeof sessionId !== "string" || sessionId === "") return;
    if (presetSessions.has(sessionId)) return;
    if (presetIdOf(agent?.ctx) !== WORKFLOW_PRESET_ID) return;
    presetSessions.add(sessionId);
    void refreshSessionState(sessionId);
  };
  ctx.on("agent/created", (payload) => claim(payload?.agent));
  ctx.on("agent/pre-step", (payload, next) => {
    claim(payload?.agent);
    return next();
  });
  const sessionState = /* @__PURE__ */ new Map();
  async function refreshSessionState(sessionId) {
    try {
      const found = await repository.findBySession(sessionId);
      if (found !== null) sessionState.set(sessionId, String(found.current_state));
    } catch {
    }
  }
  const claimBySession = (sessionId) => {
    if (presetSessions.has(sessionId)) return true;
    try {
      const registry = ctx.get("agentPresets");
      const session = ctx.get("sessions")?.get?.(sessionId);
      if (registry !== void 0 && session !== void 0) {
        const preset = registry.presetForSession(session);
        if (preset === WORKFLOW_PRESET_ID) {
          presetSessions.add(sessionId);
          void refreshSessionState(sessionId);
          return true;
        }
        if (preset !== null && preset !== void 0) return false;
      }
    } catch {
    }
    try {
      const agent = ctx.get("agents")?.get?.(sessionId);
      if (agent !== void 0) claim(agent);
    } catch {
    }
    return presetSessions.has(sessionId);
  };
  const stateContext = registerWorkflowStateContext(ctx, repository, isPresetSession);
  const PENDING_ADVANCE_TTL_MS = 5 * 60 * 1e3;
  const pendingAdvances = /* @__PURE__ */ new Map();
  const readPendingAdvance = (sessionId) => {
    const pending = pendingAdvances.get(sessionId);
    if (pending === void 0) return null;
    if (Date.now() - pending.at > PENDING_ADVANCE_TTL_MS) {
      pendingAdvances.delete(sessionId);
      return null;
    }
    return { to: pending.to, ...pending.reason === void 0 ? {} : { reason: pending.reason } };
  };
  const toolsDeps = {
    repository,
    stateContext,
    isPresetSession,
    getState: (sessionId) => sessionState.get(sessionId),
    setState: (sessionId, state) => sessionState.set(sessionId, state),
    logger: ctx.logger,
    requestAdvance: (input) => {
      pendingAdvances.set(input.sessionId, {
        to: input.to,
        ...typeof input.reason === "string" && input.reason !== "" ? { reason: input.reason } : {},
        at: Date.now()
      });
    },
    pendingAdvanceOf: (sessionId) => readPendingAdvance(sessionId),
    clearPendingAdvance: (sessionId) => {
      pendingAdvances.delete(sessionId);
    }
  };
  registerWorkflowGuard(ctx, toolsDeps);
  registerWorkflowTools(ctx, toolsDeps);
  const markState = (sessionId, state) => {
    sessionState.set(sessionId, state);
  };
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/list",
      handler: makeHandler(ctx, repository, "GET", async () => ({ items: await repository.list() }))
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/create",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.path !== "string" || body.path.trim() === "") {
          throw new Error("\u7F3A\u5C11\u5DE5\u4F5C\u76EE\u5F55 path");
        }
        const workspace = await repository.create({
          title: body.title,
          path: body.path.trim(),
          hostWorkspaceId: typeof body.hostWorkspaceId === "string" ? body.hostWorkspaceId : void 0
        });
        return { workspace };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/get",
      handler: makeHandler(ctx, repository, "GET", async (_body, query) => {
        const id = query.get("id");
        if (typeof id !== "string" || id === "") throw new Error("\u7F3A\u5C11 id");
        const snapshot = await repository.get(id);
        if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
        return { snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/state-context",
      handler: makeHandler(ctx, repository, "GET", async (_body, query) => {
        const sessionId = query.get("sessionId");
        if (typeof sessionId !== "string" || sessionId === "") throw new Error("\u7F3A\u5C11 sessionId");
        return { text: await stateContext.peek(sessionId) };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/app-settings",
      handler: makeHandler(ctx, repository, "GET", async () => ({ autoSendEnterTrigger: (await repository.getAppSettings()).autoSendEnterTrigger }))
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/app-settings-save",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        const saved = await repository.updateAppSettings({
          autoSendEnterTrigger: body?.autoSendEnterTrigger === true
        });
        logEvent(ctx.logger, "info", `[workflow] app-settings saved (autoSend=${saved.autoSendEnterTrigger})`);
        return { autoSendEnterTrigger: saved.autoSendEnterTrigger };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/global-settings",
      handler: makeHandler(ctx, repository, "GET", async (_body, _query, traceId) => {
        const startedAt = Date.now();
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        const profiles = await repository.listProfiles();
        logEvent(ctx.logger, "info", `[workflow] global-settings ok (active=${profiles.active}, ${Date.now() - startedAt}ms)`, traceId);
        return { globalOperationDetail, defaults: DEFAULT_GLOBAL_OPERATION_DETAIL, profiles: profiles.names, activeProfile: profiles.active };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/global-settings-save",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (body?.globalOperationDetail === void 0 || body.globalOperationDetail === null) {
          throw new Error("\u7F3A\u5C11 globalOperationDetail");
        }
        const startedAt = Date.now();
        const globalOperationDetail = await repository.updateAppGlobalOperationDetail(body.globalOperationDetail);
        logEvent(ctx.logger, "info", `[workflow] global-settings-save ok (shared=${Buffer.byteLength(String(globalOperationDetail.shared_detail ?? ""), "utf8")}B, ${Date.now() - startedAt}ms)`, traceId);
        return { globalOperationDetail };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/profiles-save",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.name !== "string" || body.name.trim() === "") throw new Error("\u7F3A\u5C11 name");
        const profiles = await repository.saveProfile(body.name, body.globalOperationDetail);
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        logEvent(ctx.logger, "info", `[workflow] profiles-save ok (name=${profiles.active}, total=${profiles.names.length})`, traceId);
        return { ...profiles, globalOperationDetail };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/profiles-activate",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.name !== "string" || body.name === "") throw new Error("\u7F3A\u5C11 name");
        const profiles = await repository.activateProfile(body.name);
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        logEvent(ctx.logger, "info", `[workflow] profiles-activate ok (active=${profiles.active})`, traceId);
        return { ...profiles, globalOperationDetail };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/profiles-delete",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.name !== "string" || body.name === "") throw new Error("\u7F3A\u5C11 name");
        const profiles = await repository.deleteProfile(body.name);
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        logEvent(ctx.logger, "info", `[workflow] profiles-delete ok (deleted=${body.name}, active=${profiles.active})`, traceId);
        return { ...profiles, globalOperationDetail };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/profiles-export",
      handler: makeHandler(ctx, repository, "POST", async (_body, _query, traceId) => {
        const exported = await repository.exportActiveProfile();
        spawn("explorer.exe", [join3(exported.path, "..")], { stdio: "ignore", detached: true }).unref();
        logEvent(ctx.logger, "info", `[workflow] profiles-export ok (name=${exported.name})`, traceId);
        return exported;
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/profiles-import",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.json !== "string" || body.json.trim() === "") throw new Error("\u7F3A\u5C11 json\uFF1A\u8BF7\u7C98\u8D34\u5BFC\u51FA\u7684\u6587\u4EF6\u5185\u5BB9");
        const result = await repository.importProfile(typeof body.name === "string" ? body.name : "", body.json);
        logEvent(ctx.logger, "info", `[workflow] profiles-import ok (name=${result.imported})`, traceId);
        return result;
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/node-detail",
      handler: makeHandler(ctx, repository, "GET", async (_body, query) => {
        const id = query.get("id");
        const nodeId = query.get("nodeId");
        if (typeof id !== "string" || id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof nodeId !== "string" || nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        const snapshot = await repository.get(id);
        if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
        const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
        if (node === void 0) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
        const global = await repository.getAppGlobalOperationDetail();
        return {
          node: { node_id: node.node_id, title: node.title ?? "", current_state: node.current_state, history: node.history ?? [] },
          global,
          effective: effectiveDetail(node.current_state, node, global),
          overrides: node.state_detail_overrides ?? null,
          additional: node.additional_detail ?? null
        };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/node-note",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.nodeId !== "string" || body.nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        if (typeof body?.state !== "string" || body.state === "") throw new Error("\u7F3A\u5C11 state");
        if (typeof body?.text !== "string") throw new Error("\u7F3A\u5C11 text");
        const startedAt = Date.now();
        try {
          const snapshot = await repository.setNodeNote({ id: body.id, nodeId: body.nodeId, state: body.state, text: body.text });
          logEvent(ctx.logger, "info", `[workflow] node-note ok (node=${body.nodeId}, state=${body.state}, ${Date.now() - startedAt}ms)`);
          return { snapshot };
        } catch (error) {
          logEvent(ctx.logger, "warn", `[workflow] node-note failed (node=${body.nodeId}, state=${body.state}, ${Date.now() - startedAt}ms): ${String(error?.message ?? error)}`);
          throw error;
        }
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/node-by-session",
      handler: makeHandler(ctx, repository, "GET", async (_body, query, traceId) => {
        const sessionId = query.get("sessionId");
        if (typeof sessionId !== "string" || sessionId === "") throw new Error("\u7F3A\u5C11 sessionId");
        if (!claimBySession(sessionId)) return { node: null, enabled: false };
        const startedAt = Date.now();
        const node = await repository.findBySession(sessionId);
        if (node === null) {
          logEvent(ctx.logger, "info", `[workflow] node-by-session none (session=${sessionId}, ${Date.now() - startedAt}ms)`, traceId);
          return { node: null };
        }
        const snapshot = await repository.get(node.workflowId);
        const found = snapshot?.nodes.find((candidate) => candidate.node_id === node.nodeId);
        let enterTrigger = "";
        if (found !== void 0) {
          const global = await repository.getAppGlobalOperationDetail();
          const effective = effectiveDetail(found.current_state, found, global);
          enterTrigger = typeof effective.enter_trigger === "string" ? effective.enter_trigger : "";
        }
        logEvent(ctx.logger, "info", `[workflow] node-by-session ok (node=${node.nodeId}, state=${node.current_state}, ${Date.now() - startedAt}ms)`, traceId);
        return { node: { ...node, enter_trigger: enterTrigger }, pendingAdvance: readPendingAdvance(sessionId) };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/sidebar-nodes",
      handler: makeHandler(ctx, repository, "GET", async (_body, query) => {
        const path2 = query.get("path");
        if (typeof path2 !== "string" || path2 === "") return { nodes: {} };
        const startedAt = Date.now();
        const nodes = await repository.getNodeStatesByDirectory(path2);
        const owned = {};
        for (const [sessionId, state] of Object.entries(nodes)) {
          if (presetSessions.has(sessionId)) owned[sessionId] = state;
        }
        logEvent(ctx.logger, "info", `[workflow] sidebar-nodes ok (nodes=${Object.keys(owned).length}, ${Date.now() - startedAt}ms)`);
        return { nodes: owned };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/events",
      handler: makeHandler(ctx, repository, "GET", async (_body, query) => {
        const rawLimit = Number(query.get("limit") ?? "100");
        return { events: recentEvents(Number.isFinite(rawLimit) ? rawLimit : 100) };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/bind-session",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.nodeId !== "string" || body.nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        if (typeof body?.sessionId !== "string") throw new Error("\u7F3A\u5C11 sessionId");
        const startedAt = Date.now();
        const snapshot = await repository.bindSession({ id: body.id, nodeId: body.nodeId, sessionId: body.sessionId });
        const sessionId = body.sessionId.trim();
        if (sessionId !== "") await stateContext.refreshNow(sessionId);
        logEvent(ctx.logger, "info", `[workflow] bind-session (node=${body.nodeId}, bound=${sessionId !== ""}, ${Date.now() - startedAt}ms)`, traceId);
        return { snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/approve-advance",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.sessionId !== "string" || body.sessionId === "") throw new Error("\u7F3A\u5C11 sessionId");
        const pending = readPendingAdvance(body.sessionId);
        if (pending === null) throw new Error("\u6CA1\u6709\u5F85\u786E\u8BA4\u7684\u63A8\u8FDB\u8BF7\u6C42\uFF08\u53EF\u80FD\u5DF2\u8D85\u65F6\u6216\u5DF2\u5904\u7406\uFF09");
        if (body.accept !== true) {
          pendingAdvances.delete(body.sessionId);
          logEvent(ctx.logger, "info", `[workflow] advance rejected by user (session=${body.sessionId}, to=${pending.to})`);
          return { accepted: false, requested: pending.to };
        }
        const found = await repository.findBySession(body.sessionId);
        if (found === null) throw new Error("\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 workflow \u8282\u70B9");
        const from = String(found.current_state);
        await assertAdvanceAllowed(repository, found, from, pending.to);
        const snapshot = await repository.transitionNode({ id: found.workflowId, nodeId: found.nodeId, to: pending.to, by: "agent-request" });
        pendingAdvances.delete(body.sessionId);
        markState(body.sessionId, pending.to);
        await stateContext.refreshNow(body.sessionId);
        logEvent(ctx.logger, "info", `[workflow] advance accepted by user (session=${body.sessionId}, ${from}\u2192${pending.to})`);
        return { accepted: true, snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/delete",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        await repository.remove(body.id);
        logEvent(ctx.logger, "info", `[workflow] delete\u2192trash (id=${body.id})`);
        return { deleted: body.id };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/trash-list",
      handler: makeHandler(ctx, repository, "GET", async () => ({ items: await repository.listTrash() }))
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/trash-restore",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        const restored = await repository.restoreFromTrash(body.id);
        logEvent(ctx.logger, "info", `[workflow] trash-restore (id=${body.id}, ok=${String(restored)})`);
        return { restored };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/link-workspace",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.hostWorkspaceId !== "string") throw new Error("\u7F3A\u5C11 hostWorkspaceId");
        const snapshot = await repository.linkWorkspace({ id: body.id, hostWorkspaceId: body.hostWorkspaceId });
        return { snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/ensure-node",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.sessionId !== "string" || body.sessionId === "") throw new Error("\u7F3A\u5C11 sessionId");
        if (typeof body?.workingDirectory !== "string" || body.workingDirectory === "") throw new Error("\u7F3A\u5C11 workingDirectory");
        if (!claimBySession(body.sessionId)) {
          const knownSession = (() => {
            try {
              return ctx.get("sessions")?.get?.(body.sessionId);
            } catch {
              return void 0;
            }
          })();
          if (knownSession !== void 0) {
            logEvent(ctx.logger, "info", `[workflow] ensure-node skipped (session=${body.sessionId}, not a workflow session)`);
            return { node: null, enabled: false };
          }
          presetSessions.add(body.sessionId);
          logEvent(ctx.logger, "info", `[workflow] ensure-node for unknown session (session=${body.sessionId}, treated as test)`);
        }
        const startedAt = Date.now();
        try {
          const node = await repository.ensureNode({ sessionId: body.sessionId, workingDirectory: body.workingDirectory });
          logEvent(ctx.logger, "info", `[workflow] ensure-node ok (node=${node.nodeId}, ${Date.now() - startedAt}ms)`);
          return { node };
        } catch (error) {
          logEvent(ctx.logger, "warn", `[workflow] ensure-node failed (${Date.now() - startedAt}ms): ${String(error?.message ?? error)}`);
          throw error;
        }
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/node-manual",
      handler: makeHandler(ctx, repository, "GET", async (_body, query, traceId) => {
        const id = query.get("id");
        const nodeId = query.get("nodeId");
        if (typeof id !== "string" || id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof nodeId !== "string" || nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        const startedAt = Date.now();
        const manual = await repository.readNodeManual(id, nodeId);
        const globalManual = await repository.readGlobalManual(id);
        logEvent(ctx.logger, "info", `[workflow] node-manual (node=${nodeId}, exists=${String(manual !== null)}, manual=${manual === null ? 0 : Buffer.byteLength(manual.manual, "utf8")}B, global=${Buffer.byteLength(globalManual, "utf8")}B, ${Date.now() - startedAt}ms)`, traceId);
        return { manual, globalManual };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/node-checklist",
      handler: makeHandler(ctx, repository, "GET", async (_body, query, traceId) => {
        const id = query.get("id");
        const nodeId = query.get("nodeId");
        if (typeof id !== "string" || id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof nodeId !== "string" || nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        const startedAt = Date.now();
        const meta = await repository.getManualMeta(id, nodeId);
        logEvent(ctx.logger, "info", `[workflow] node-checklist (node=${nodeId}, exists=${String(meta !== null)}, items=${meta?.checklist.length ?? 0}, ${Date.now() - startedAt}ms)`, traceId);
        return {
          exists: meta !== null,
          checklist: meta?.checklist ?? [],
          hasPlan: meta?.hasPlan ?? false
        };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/open-folder",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        const target = body?.path;
        if (typeof target !== "string" || target.trim() === "") throw new Error("\u7F3A\u5C11 path");
        spawn("explorer.exe", [target.trim()], { stdio: "ignore", detached: true }).unref();
        return { opened: true };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/transition",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.nodeId !== "string" || body.nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        if (typeof body?.to !== "string" || body.to === "") throw new Error("\u7F3A\u5C11 to");
        const startedAt = Date.now();
        try {
          const before = await repository.get(body.id);
          const nodeBefore = before?.nodes.find((node) => node.node_id === body.nodeId);
          if (nodeBefore !== void 0) {
            await assertAdvanceAllowed(
              repository,
              { workflowId: body.id, nodeId: body.nodeId, current_state: nodeBefore.current_state },
              String(nodeBefore.current_state),
              body.to
            );
          }
          const snapshot = await repository.transitionNode({ id: body.id, nodeId: body.nodeId, to: body.to, by: "human" });
          const moved = snapshot.nodes.find((node) => node.node_id === body.nodeId);
          if (typeof moved?.session_id === "string" && moved.session_id !== "") {
            pendingAdvances.delete(moved.session_id);
            markState(moved.session_id, body.to);
            await stateContext.refreshNow(moved.session_id);
          }
          const lastEntry = moved?.history?.[moved.history.length - 1];
          logEvent(ctx.logger, "info", `[workflow] transition ok (node=${body.nodeId}, from=${lastEntry?.from ?? "?"}, to=${body.to}, ${Date.now() - startedAt}ms)`, traceId);
          return { snapshot };
        } catch (error) {
          logEvent(ctx.logger, "warn", `[workflow] transition failed (node=${body.nodeId}, to=${body.to}, ${Date.now() - startedAt}ms): ${String(error?.message ?? error)}`, traceId);
          throw error;
        }
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/pin",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        const snapshot = await repository.setPinned({ id: body.id, pinned: body.pinned === true });
        return { snapshot };
      })
    }));
  });
}
export {
  apply,
  inject
};
