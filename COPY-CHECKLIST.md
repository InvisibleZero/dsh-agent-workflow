# 照抄清单（dsh-agent-workflow 伪装层）

宿主源码：`E:\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-client-ui-workspace\lib\client.js`（5356 行，rolldown 产物）。

原则：**只抄结构/类名/组件用法，只改三处** —— 数据来源（我们自己的 `useWorkspaces`/`useSessions`）、翻译（宿主 `t()` → 我们自己的中文串）、砍掉暂不需要的功能（拖拽 / 水印 / marquee / 真正嵌套树）。

> 状态：☐ 未做 / ◐ 进行中 / ✅ 已对齐

## 行级（SessionNodeItem，宿主 L2255–2369）

- ✅ 1. 行子组件：`displayTitle` + `sessionStatuses` + `SessionStatusDots`（StateDot）+ `timeLabel`（relativeTime）+ `PinnedIndicator`（IconPinFillRegular）
- ✅ 2. `⋯` 菜单：ui-primitives `Menu`（open/onClose/portal/closeOnPointerLeave/anchor）+ `IconEllipsisOutlineRegular`
- ✅ 3. `HoverCard` 包裹 + `SessionHoverContent`
- ✅ 行容器/顺序/hookContext

## 工作区行（WorkspaceNodeItem，宿主约 L1960–2055）

- ✅ 4. chevron（IconTriangleRightFillRegular + arrow/arrowOpen）+ `projectText`/`title`
- ✅ 5. 工作区行自己的 `Menu`（重命名/删除）+ 新建会话 Tooltip（IconNewChatOutlineRegular）
- ☐ 6. `WorkspaceHoverContent`（工作区 hover 卡，暂用简化/缺失）

## 容器（WorkspaceBrowser + SessionTree，宿主约 L3000–3500）

- ✅ 7. 表头：`sectionHeader` + `sectionLabel` + 搜索 + 视图选项 Menu（分组/排序/归档过滤）
- ✅ 8. 树容器：`listArea`/`list` + 空态（砍掉 AnimatedRows 动画）
- ✅ 9. 会话分组：`groupSection` + 缩进 + 平铺/分组切换；`workspace-tree` 暂等价于按工作区分组

## 数据契约（字段名，已按宿主消费点逐一确认）

- ✅ 10. `WorkspaceView`：`workspaceId` / `title` / `path` / `sessionIds` / `createdAt` / `updatedAt`；快照顶层 `items` / `archivedSessionIds` / `pinnedSessionIds`
- ✅ 11. session 摘要：`id` / `title`（可空）/ `blank` / `updatedAt` / `cwd` / `running` / `runningSubagentCount` / `pendingInteraction` / `completed` / `retainedBy.mainView`（`pinned`/`archived` 不在摘要上，是快照集合，已合成到节点）

## 注册（apply，宿主 L5221–5289）

- ✅ 子槽声明 + `priority: -1` + `menuOpenStateFactory`
- ✅ 12. `browserInjected` 对照：open/startSession/create/rename/delete/unarchive 已等价（走服务直连）；内容搜索/拖拽重排/快捷键未做（不在清单）
- ✅ 13. 重命名/归档对话框、行操作 toast：**宿主自带**（`shell.overlay` 注册），我们声明子槽后自动可用，无需实现

## 置顶（结论）

- ✅ 直接复用宿主能力：菜单项 + 行内星标由宿主提供；我们只按 `pinnedSessionIds` 排序（本工作区内置顶优先）。
- ⛔ 已删除失败的替代方案：本地置顶仓库 + `/dsh-agent-workflow/pins` 路由 + `uiWorkspace.pinSession` 补丁（宿主自带，无需接管）。

## 样式

- ✅ 行/浏览器类名：运行时从注入样式表反查前缀（不硬编码哈希）
- ☐ 14. 补 `WorkspaceBrowser.module.css` / `Rows.module.css` 里我们还没用上的类（drop 系列等，属拖拽范畴）

---

## 依赖

- ✅ 15. 引入 `@deepseek-ai/dsh-client-ui-primitives`（StateDot / Menu / HoverCard / Icon* / relativeTime / Tooltip），已加进客户端包纯度白名单 + 单测 mock
