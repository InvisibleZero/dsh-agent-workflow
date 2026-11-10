// src/host.ts
import { homedir } from "node:os";
import { join as join2 } from "node:path";

// src/host/workflow-repository.ts
import { promises as fs2 } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";

// src/adapter/json-storage.ts
import { promises as fs } from "node:fs";
import path from "node:path";

// src/schema/workflow.ts
import { z as z3 } from "zod";

// src/schema/node.ts
import { z as z2 } from "zod";

// src/schema/node-state.ts
import { z } from "zod";

// src/schema/node-state-label.ts
var NODE_STATE_LABEL = {
  not_started: "\u672A\u5F00\u59CB",
  discussing: "\u8BA8\u8BBA\u4E2D",
  implementing: "\u5B9E\u73B0\u4E2D",
  verifying: "\u9A8C\u6536\u4E2D",
  completed: "\u5DF2\u5B8C\u7ED3"
};

// src/schema/node-state.ts
var NodeState = z.enum([
  "not_started",
  // 未开始（保留态）
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
   */
  additional_detail: z2.object({
    discussing: z2.string().optional(),
    implementing: z2.string().optional(),
    verifying: z2.string().optional()
  }).optional(),
  // —— 防御性约束 ——
  depth: z2.number().int().nonnegative(),
  max_depth: z2.number().int().positive(),
  step_count: z2.number().int().nonnegative(),
  max_steps: z2.number().int().positive()
});

// src/schema/workflow.ts
var GlobalOperationDetail = z3.object({
  shared_detail: z3.string(),
  // A：三态通用的公共操作细节
  discussing: StateDetail,
  // B
  implementing: StateDetail,
  // C
  verifying: StateDetail
  // D
});
var AggregationMode = z3.enum(["manual", "all_complete", "any_active"]);
var WorkflowSettings = z3.object({
  global_operation_detail: GlobalOperationDetail,
  default_max_depth: z3.number().int().positive(),
  default_max_steps: z3.number().int().positive(),
  aggregation_mode: AggregationMode
});
var WorkflowSnapshot = z3.object({
  version: z3.literal(1),
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
  shared_detail: "\u7ED3\u8BBA\u5148\u884C\u3001\u4F9D\u636E\u5145\u5206\uFF1B\u5BF9\u4E0D\u786E\u5B9A\u5904\u5982\u5B9E\u8BF4\u660E\uFF0C\u4E0D\u505A\u65E0\u4F9D\u636E\u7684\u5224\u65AD\u3002",
  // B —— 讨论中
  discussing: {
    operation_detail: "\u68B3\u7406\u76EE\u6807\u4E0E\u73B0\u72B6\uFF0C\u5217\u51FA\u53EF\u9009\u65B9\u6848\u53CA\u5404\u81EA\u53D6\u820D\uFF0C\u6682\u4E0D\u4FEE\u6539\u4EFB\u4F55\u6587\u4EF6\uFF1B\u5F85\u65B9\u6848\u786E\u8BA4\u540E\u518D\u63A8\u8FDB\u3002",
    enter_trigger: null
  },
  // C —— 实现中
  implementing: {
    operation_detail: "\u6309\u5DF2\u786E\u8BA4\u7684\u65B9\u6848\u5B9E\u73B0\uFF1B\u5B8C\u6210\u540E\u7528\u7B80\u660E\u8BED\u8A00\u4EA4\u4EE3\u6539\u4E86\u4EC0\u4E48\u3001\u5F71\u54CD\u8303\u56F4\u3001\u6F5C\u5728\u98CE\u9669\u3002",
    enter_trigger: null
  },
  // D —— 验收中
  verifying: {
    operation_detail: "\u9010\u9879\u6838\u5BF9\u5B9E\u73B0\u662F\u5426\u6EE1\u8DB3\u9A8C\u6536\u6761\u4EF6\uFF0C\u68C0\u67E5\u56DE\u5F52\u4E0E\u8FB9\u754C\u60C5\u51B5\uFF0C\u8BB0\u5F55\u95EE\u9898\u4E0E\u5904\u7406\u7ED3\u679C\u3002",
    enter_trigger: null
  }
};
var DEFAULT_SETTINGS = {
  global_operation_detail: DEFAULT_GLOBAL_OPERATION_DETAIL,
  default_max_depth: 8,
  default_max_steps: 200,
  aggregation_mode: "manual"
};

// src/schema/migration.ts
var CURRENT_SNAPSHOT_VERSION = 1;
var SNAPSHOT_MIGRATIONS = {};
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
  tracePath(traceId) {
    return path.join(this.baseDir, "traces", `${traceId}.jsonl`);
  }
  checkpointPath(nodeId) {
    return path.join(this.baseDir, "checkpoints", `${nodeId}.json`);
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
    const tmp = `${p}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
    await fs.rename(tmp, p);
  }
  async appendTrace(log) {
    const p = this.tracePath(log.trace_id);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.appendFile(p, `${JSON.stringify(log)}
`, "utf8");
  }
  async saveCheckpoint(nodeId, snapshot) {
    const p = this.checkpointPath(nodeId);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(snapshot), "utf8");
  }
  async loadCheckpoint(nodeId) {
    try {
      return JSON.parse(await fs.readFile(this.checkpointPath(nodeId), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
};

// src/host/workflow-repository.ts
function buildRootNode(id, maxDepth, maxSteps) {
  return {
    node_id: id,
    parent_id: null,
    node_type: "workspace",
    current_state: "not_started",
    child_ids: [],
    context_payload: null,
    flags: [],
    depth: 0,
    max_depth: maxDepth,
    step_count: 0,
    max_steps: maxSteps
  };
}
var WorkflowRepository = class {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.storage = new JsonStorageAdapter(baseDir);
  }
  storage;
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
    const id = randomUUID();
    const trimmedTitle = input.title?.trim() ?? "";
    const title = trimmedTitle !== "" ? trimmedTitle : basename(input.path);
    const hostWorkspaceId = typeof input.hostWorkspaceId === "string" && input.hostWorkspaceId !== "" ? input.hostWorkspaceId : void 0;
    const snapshot = {
      version: 1,
      workspace_id: id,
      title,
      working_directory: input.path,
      ...hostWorkspaceId === void 0 ? {} : { host_workspace_id: hostWorkspaceId },
      settings: DEFAULT_SETTINGS,
      nodes: [buildRootNode(id, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps)]
    };
    await this.storage.save(snapshot);
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
  /** 应用级全局操作细节（A + B/C/D）：所有 workflow 共用一份，存在 <baseDir>/global-settings.json。 */
  appGlobalSettingsPath() {
    return join(this.baseDir, "global-settings.json");
  }
  async getAppGlobalOperationDetail() {
    try {
      const raw = JSON.parse(await fs2.readFile(this.appGlobalSettingsPath(), "utf8"));
      return GlobalOperationDetail.parse(raw);
    } catch (error) {
      if (error.code === "ENOENT") return DEFAULT_GLOBAL_OPERATION_DETAIL;
      return DEFAULT_GLOBAL_OPERATION_DETAIL;
    }
  }
  async updateAppGlobalOperationDetail(raw) {
    const parsed = GlobalOperationDetail.parse(raw);
    await fs2.mkdir(this.baseDir, { recursive: true });
    const target = this.appGlobalSettingsPath();
    const tmp = `${target}.tmp`;
    await fs2.writeFile(tmp, JSON.stringify(parsed, null, 2), "utf8");
    await fs2.rename(tmp, target);
    return parsed;
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
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const state = input.state;
    if (!["discussing", "implementing", "verifying"].includes(state)) throw new Error("\u975E\u6CD5\u72B6\u6001");
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
  /** 删除整份 workflow 快照（宿主工作区被删除时同步清理，避免留下孤儿行）。 */
  async remove(id) {
    const path2 = join(this.baseDir, "workflows", `${id}.json`);
    try {
      await fs2.unlink(path2);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
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
  /** 把某个节点推进到下一状态（五态单向：not_started→discussing→implementing→verifying→completed）。 */
  async transitionNode(input) {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const validStates = ["not_started", "discussing", "implementing", "verifying", "completed"];
    if (!validStates.includes(input.to)) throw new Error("\u975E\u6CD5\u72B6\u6001");
    const exists = snapshot.nodes.some((node) => node.node_id === input.nodeId);
    if (!exists) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
    const updated = {
      ...snapshot,
      nodes: snapshot.nodes.map(
        (node) => node.node_id === input.nodeId ? { ...node, current_state: input.to } : node
      )
    };
    await this.storage.save(updated);
    return updated;
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
  /**
   * 在某个父节点下加一个子节点（可无限层，受 max_depth 限制）。
   * 只改我们自己的快照，与 dsh 的 workspace 无关。
   */
  async addNode(input) {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const parent = snapshot.nodes.find((node) => node.node_id === input.parentId);
    if (parent === void 0) throw new Error("\u627E\u4E0D\u5230\u7236\u8282\u70B9");
    if (parent.depth + 1 > parent.max_depth) throw new Error(`\u8D85\u8FC7\u6700\u5927\u6DF1\u5EA6\uFF08${String(parent.max_depth)}\uFF09`);
    const nodeId = randomUUID();
    const child = {
      ...buildRootNode(nodeId, parent.max_depth, parent.max_steps),
      parent_id: parent.node_id,
      title: input.title?.trim() !== "" && input.title !== void 0 ? input.title.trim() : "\u65B0\u5B50\u8282\u70B9",
      node_type: "task",
      depth: parent.depth + 1
    };
    const updated = {
      ...snapshot,
      nodes: [
        ...snapshot.nodes.map(
          (node) => node.node_id === parent.node_id ? { ...node, child_ids: [...node.child_ids, nodeId] } : node
        ),
        child
      ]
    };
    await this.storage.save(updated);
    return updated;
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

// src/host/workflow-state-context.ts
var MAX_TEXT_BYTES = 3200;
function registerWorkflowStateContext(ctx, repository) {
  const cache = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Set();
  const buildText = async (sessionId) => {
    const found = await repository.findBySession(sessionId);
    if (found === null || found === void 0) {
      cache.delete(sessionId);
      return "";
    }
    const snapshot = await repository.get(found.workflowId);
    if (snapshot === null) {
      cache.delete(sessionId);
      return "";
    }
    const node = snapshot.nodes.find((candidate) => candidate.node_id === found.nodeId);
    if (node === void 0) {
      cache.delete(sessionId);
      return "";
    }
    const global = await repository.getAppGlobalOperationDetail();
    const effective = effectiveDetail(node.current_state, node, global);
    const label = NODE_STATE_LABEL[node.current_state] ?? node.current_state;
    const parts = [
      "<workflow-state>",
      `\u8282\u70B9\uFF1A${node.title || "(\u672A\u547D\u540D)"}\u3000workflow\uFF1A${snapshot.title}`,
      `\u5F53\u524D\u72B6\u6001\uFF1A${label}`
    ];
    if (typeof effective.full_detail === "string" && effective.full_detail.trim() !== "") {
      parts.push("", effective.full_detail.trim());
    }
    const addition = typeof node.additional_detail === "object" && node.additional_detail !== null ? node.additional_detail[node.current_state] : void 0;
    if (typeof addition === "string" && addition.trim() !== "") {
      parts.push("", `\u672C\u8282\u70B9\u8865\u5145\u8981\u6C42\uFF1A${addition.trim()}`);
    }
    parts.push("</workflow-state>");
    let text = parts.join("\n");
    if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
      text = `${text.slice(0, MAX_TEXT_BYTES)}\u2026\uFF08\u5DF2\u622A\u65AD\uFF09`;
    }
    cache.set(sessionId, { text, nodeId: node.node_id, state: node.current_state });
    return text;
  };
  const refresh = (sessionId) => {
    if (typeof sessionId !== "string" || sessionId === "" || pending.has(sessionId)) return;
    pending.add(sessionId);
    void buildText(sessionId).catch((error) => {
      ctx.logger?.warn?.("workflow state context refresh failed: %o", error);
    }).finally(() => pending.delete(sessionId));
  };
  const readText = (sessionId) => {
    if (typeof sessionId !== "string" || sessionId === "") return "";
    const entry = cache.get(sessionId);
    if (entry !== void 0) return entry.text;
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
      await buildText(sessionId);
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

// src/host.ts
var inject = [];
function resolveDataDir() {
  const profileDir = process.env.DSH_PROFILE_DIR;
  const base = profileDir && profileDir.trim() !== "" ? profileDir : join2(homedir(), ".dsh");
  return join2(base, "dsh-agent-workflow");
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
function makeHandler(repository, method, run) {
  return async (req, res) => {
    if (!isLoopbackRequest(req)) return denyRequest(res);
    if (req.method !== method) return sendJson(res, 405, { ok: false, error: `\u53EA\u63A5\u53D7 ${method}` });
    let body = {};
    let query = new URLSearchParams();
    try {
      if (req.method === "POST") body = await readJsonBody(req);
      const rawQuery = String((req.url ?? "").split("?")[1] ?? "");
      query = new URLSearchParams(rawQuery);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: String(error.message ?? error) });
    }
    try {
      const value = await run(body, query);
      sendJson(res, 200, { ok: true, ...value });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: String(error.message ?? error) });
    }
  };
}
function apply(ctx) {
  const repository = new WorkflowRepository(resolveDataDir());
  const stateContext = registerWorkflowStateContext(ctx, repository);
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/list",
      handler: makeHandler(repository, "GET", async () => ({ items: await repository.list() }))
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/create",
      handler: makeHandler(repository, "POST", async (body) => {
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
      handler: makeHandler(repository, "GET", async (_body, query) => {
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
      handler: makeHandler(repository, "GET", async (_body, query) => {
        const sessionId = query.get("sessionId");
        if (typeof sessionId !== "string" || sessionId === "") throw new Error("\u7F3A\u5C11 sessionId");
        return { text: await stateContext.peek(sessionId) };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/global-settings",
      handler: makeHandler(repository, "GET", async () => ({
        globalOperationDetail: await repository.getAppGlobalOperationDetail()
      }))
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/global-settings-save",
      handler: makeHandler(repository, "POST", async (body) => {
        if (body?.globalOperationDetail === void 0 || body.globalOperationDetail === null) {
          throw new Error("\u7F3A\u5C11 globalOperationDetail");
        }
        const globalOperationDetail = await repository.updateAppGlobalOperationDetail(body.globalOperationDetail);
        return { globalOperationDetail };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/node-detail",
      handler: makeHandler(repository, "GET", async (_body, query) => {
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
          node: { node_id: node.node_id, title: node.title ?? "", current_state: node.current_state },
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
      handler: makeHandler(repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.nodeId !== "string" || body.nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        if (typeof body?.state !== "string" || body.state === "") throw new Error("\u7F3A\u5C11 state");
        if (typeof body?.text !== "string") throw new Error("\u7F3A\u5C11 text");
        const snapshot = await repository.setNodeNote({ id: body.id, nodeId: body.nodeId, state: body.state, text: body.text });
        return { snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/node-by-session",
      handler: makeHandler(repository, "GET", async (_body, query) => {
        const sessionId = query.get("sessionId");
        if (typeof sessionId !== "string" || sessionId === "") throw new Error("\u7F3A\u5C11 sessionId");
        const node = await repository.findBySession(sessionId);
        if (node === null) return { node: null };
        const snapshot = await repository.get(node.workflowId);
        const found = snapshot?.nodes.find((candidate) => candidate.node_id === node.nodeId);
        let enterTrigger = "";
        if (found !== void 0) {
          const global = await repository.getAppGlobalOperationDetail();
          const effective = effectiveDetail(found.current_state, found, global);
          enterTrigger = typeof effective.enter_trigger === "string" ? effective.enter_trigger : "";
        }
        return { node: { ...node, enter_trigger: enterTrigger } };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/bind-session",
      handler: makeHandler(repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.nodeId !== "string" || body.nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        if (typeof body?.sessionId !== "string") throw new Error("\u7F3A\u5C11 sessionId");
        const snapshot = await repository.bindSession({ id: body.id, nodeId: body.nodeId, sessionId: body.sessionId });
        const sessionId = body.sessionId.trim();
        if (sessionId !== "") await stateContext.refreshNow(sessionId);
        return { snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/delete",
      handler: makeHandler(repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        await repository.remove(body.id);
        return { deleted: body.id };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/link-workspace",
      handler: makeHandler(repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.hostWorkspaceId !== "string") throw new Error("\u7F3A\u5C11 hostWorkspaceId");
        const snapshot = await repository.linkWorkspace({ id: body.id, hostWorkspaceId: body.hostWorkspaceId });
        return { snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/add-node",
      handler: makeHandler(repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.parentId !== "string" || body.parentId === "") throw new Error("\u7F3A\u5C11 parentId");
        const snapshot = await repository.addNode({
          id: body.id,
          parentId: body.parentId,
          title: typeof body.title === "string" ? body.title : void 0
        });
        return { snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/transition",
      handler: makeHandler(repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.nodeId !== "string" || body.nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        if (typeof body?.to !== "string" || body.to === "") throw new Error("\u7F3A\u5C11 to");
        const snapshot = await repository.transitionNode({ id: body.id, nodeId: body.nodeId, to: body.to });
        const moved = snapshot.nodes.find((node) => node.node_id === body.nodeId);
        if (typeof moved?.session_id === "string" && moved.session_id !== "") {
          await stateContext.refreshNow(moved.session_id);
        }
        return { snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-agent-workflow/pin",
      handler: makeHandler(repository, "POST", async (body) => {
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
