window.__ModuleLoader__.load({
  id: "dsh-agent-workflow",
  factory: (require) => {
    var __mods = {
    "client/dsh-plugin.js": function(__req, module, exports) {
    "use strict";
    // @ts-nocheck
    /**
     * dsh 客户端插件入口（浏览器半）。
     *
     * 减法后不再替换宿主的侧栏浏览器（不注册 sidebar.workspaces，不照抄 WorkspaceBrowser）。
     * 只保留会话维度的东西：
     *   - 输入框工具条里的 workflow 状态徽标（当前状态 / 推进 / 实施清单）；
     *   - 设置页里的「操作细节」分区（应用级 A/B/C/D）。
     */
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.inject = exports.name = void 0;
    exports.apply = apply;
    const workflow_embedded_1 = __req("client/workflow-embedded.js");
    const workflow_dialogs_1 = __req("client/workflow-dialogs.js");
    const session_row_dot_1 = __req("client/session-row-dot.js");
    exports.name = 'dsh-agent-workflow-client';
    exports.inject = ['slots'];
    function apply(ctx) {
        // 输入框工具条里的 workflow 状态徽标（权限控件右边）。
        try {
            (0, workflow_embedded_1.applyWorkflowComposerBadge)(ctx);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 状态徽标注册失败：', error);
        }
        // 侧栏会话行的行尾常驻状态点（非交互，颜色按节点状态）。
        try {
            (0, session_row_dot_1.applySessionRowStateDots)(ctx);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 会话行状态点注册失败：', error);
        }
        // 设置页里的「操作细节」（应用级全局 A/B/C/D）。
        try {
            (0, workflow_dialogs_1.applyWorkflowSettingsSection)(ctx);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 设置分区注册失败：', error);
        }
    }
    //# sourceMappingURL=dsh-plugin.js.map
    },
    "client/workflow-embedded.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.applyWorkflowComposerBadge = applyWorkflowComposerBadge;
    const jsx_runtime_1 = require("react/jsx-runtime");
    // @ts-nocheck
    /**
     * workflow 模块（减法后）：不再渲染树 / 不再替换宿主的侧栏浏览器。
     *
     * 现在只保留会话维度的东西：
     *   - 会话状态徽标（输入框工具条）：当前状态 + 推进 + 实施清单。
     *   - 节点补充说明 / 工作手册（只读）、全局操作细节设置：都由徽标自己用 portal 弹窗。
     *
     * 弹窗改用 `createPortal(document.body)`：输入框容器有 transform，自绘 fixed 会跑偏，
     * portal 挂 body 上 fixed 相对视口，彻底绕开这个坑。
     */
    const react_1 = require("react");
    const react_dom_1 = require("react-dom");
    const node_state_label_1 = __req("schema/node-state-label.js");
    const workflow_dialogs_1 = __req("client/workflow-dialogs.js");
    const menu_anchor_1 = __req("client/menu-anchor.js");
    const node_state_color_1 = __req("client/node-state-color.js");
    const dsh_client_ui_primitives_1 = require("@deepseek-ai/dsh-client-ui-primitives");
    /** 四态单向推进表。 */
    const NEXT_NODE_STATE = {
        discussing: 'implementing',
        implementing: 'verifying',
        verifying: 'completed',
        completed: null,
    };
    /** 返工（后退）转移表：当前态 → 可退回的态。 */
    const BACKWARD_STATES = {
        implementing: ['discussing'],
        verifying: ['implementing', 'discussing'],
    };
    function WorkflowStateBadge(props) {
        const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
        const [nodeInfo, setNodeInfo] = (0, react_1.useState)(null);
        const [advancing, setAdvancing] = (0, react_1.useState)(false);
        const [checklist, setChecklist] = (0, react_1.useState)([]);
        const [hasPlan, setHasPlan] = (0, react_1.useState)(true);
        const [checklistMenu, setChecklistMenu] = (0, react_1.useState)(null);
        const [backwardMenu, setBackwardMenu] = (0, react_1.useState)(null);
        const [detailOpen, setDetailOpen] = (0, react_1.useState)(false);
        const [settingsOpen, setSettingsOpen] = (0, react_1.useState)(false);
        const [returnToDetail, setReturnToDetail] = (0, react_1.useState)(false);
        const [confirmOpen, setConfirmOpen] = (0, react_1.useState)(false);
        const claimedRef = (0, react_1.useRef)(false);
        // 自动认领需要会话的工作目录：useSessions 是带选择器的钩子，直接取当前会话的 cwd。
        const sessionCwd = typeof props?.useSessions === 'function'
            ? props.useSessions((s) => (s?.byId?.[sessionId]?.cwd ?? ''))
            : '';
        const ensureNode = async (workingDirectory) => {
            try {
                const response = await fetch('/dsh-agent-workflow/ensure-node', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ sessionId, workingDirectory }),
                });
                const responseBody = await response.json().catch(() => null);
                return responseBody?.ok === true && responseBody.node !== null && responseBody.node !== undefined;
            }
            catch {
                return false;
            }
        };
        const readChecklist = async (workflowId, nodeId) => {
            try {
                const response = await fetch(`/dsh-agent-workflow/node-checklist?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
                const responseBody = await response.json().catch(() => null);
                if (responseBody?.ok === true) {
                    const items = Array.isArray(responseBody.checklist) ? responseBody.checklist : [];
                    const plan = responseBody.hasPlan !== false;
                    setChecklist(items);
                    setHasPlan(plan);
                    return { checklist: items, hasPlan: plan };
                }
            }
            catch {
                setChecklist([]);
            }
            return { checklist: [], hasPlan: true };
        };
        const readNode = async () => {
            try {
                const response = await fetch(`/dsh-agent-workflow/node-by-session?sessionId=${encodeURIComponent(sessionId)}`);
                const responseBody = await response.json().catch(() => null);
                const node = responseBody?.ok === true ? responseBody.node : null;
                if (node === null || node === undefined) {
                    setNodeInfo(null);
                    return null;
                }
                const info = {
                    state: String(node.current_state),
                    workflowId: String(node.workflowId),
                    nodeId: String(node.nodeId),
                    enterTrigger: typeof node.enter_trigger === 'string' ? node.enter_trigger : '',
                    pendingAdvance: responseBody?.pendingAdvance === undefined || responseBody?.pendingAdvance === null
                        ? null
                        : { to: String(responseBody.pendingAdvance.to) },
                };
                setNodeInfo(info);
                return info;
            }
            catch {
                setNodeInfo(null);
                return null;
            }
        };
        /** 把「进入后默认输入」填进输入框（半自动：不发送）。InputActions 方法名按候选逐个试。 */
        const pushDraft = (text) => {
            const actions = props?.inputActions;
            if (actions === undefined || actions === null || text === '')
                return false;
            const candidates = ['setText', 'setDraft', 'replaceText', 'insertText', 'appendText', 'setValue', 'insert', 'append'];
            for (const name of candidates) {
                const method = actions[name];
                if (typeof method !== 'function')
                    continue;
                try {
                    method.call(actions, text);
                    return true;
                }
                catch (error) {
                    console.warn('[dsh-agent-workflow] 写入默认输入失败：', name, error);
                }
            }
            console.warn('[dsh-agent-workflow] 输入框没有可用的写入方法，现有方法：', Object.keys(actions).join(','));
            return false;
        };
        /** 读应用级开关：切换状态时是否自动发送默认输入（默认关闭）。 */
        const readAutoSend = async () => {
            try {
                const response = await fetch('/dsh-agent-workflow/app-settings');
                const responseBody = await response.json().catch(() => null);
                return responseBody?.ok === true && responseBody.autoSendEnterTrigger === true;
            }
            catch {
                return false;
            }
        };
        /** 提交输入框内容：优先用 InputActions 的提交方法，退回在输入框上模拟 Enter。 */
        const submitDraft = () => {
            const actions = props?.inputActions;
            if (actions !== undefined && actions !== null) {
                const candidates = ['submit', 'send', 'submitInput', 'sendInput', 'sendMessage', 'submitMessage'];
                for (const name of candidates) {
                    const method = actions[name];
                    if (typeof method !== 'function')
                        continue;
                    try {
                        method.call(actions);
                        return true;
                    }
                    catch (error) {
                        console.warn('[dsh-agent-workflow] 提交默认输入失败：', name, error);
                    }
                }
            }
            const field = document.querySelector('textarea');
            if (field instanceof HTMLTextAreaElement) {
                field.focus();
                field.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true,
                }));
                return true;
            }
            return false;
        };
        /** 推进后的默认输入：按开关决定"只填入"还是"填入并发送"。 */
        const applyEnterTrigger = async (text) => {
            if (text === '')
                return;
            if (!pushDraft(text))
                return;
            if (!(await readAutoSend()))
                return;
            submitDraft();
        };
        (0, react_1.useEffect)(() => {
            if (sessionId === '') {
                setNodeInfo(null);
                return undefined;
            }
            let cancelled = false;
            const tick = async () => {
                if (cancelled)
                    return;
                let info = await readNode();
                // 自动认领：会话还没节点时，用它的工作目录补建一个（只试一次）。
                if (info === null && !claimedRef.current && sessionCwd !== '') {
                    claimedRef.current = true;
                    const ok = await ensureNode(sessionCwd);
                    if (ok)
                        info = await readNode();
                }
                if (info !== null && info.state === 'implementing')
                    void readChecklist(info.workflowId, info.nodeId);
                else
                    setChecklist([]);
            };
            void tick();
            const timer = window.setInterval(tick, 3000);
            return () => {
                cancelled = true;
                window.clearInterval(timer);
            };
        }, [sessionId, sessionCwd]);
        if (nodeInfo === null)
            return null;
        const label = node_state_label_1.NODE_STATE_LABEL[nodeInfo.state] ?? nodeInfo.state;
        const nextState = NEXT_NODE_STATE[nodeInfo.state] ?? null;
        /** 真正写状态（前进或返工） + 刷新 + 填默认输入。 */
        const transitionTo = async (to) => {
            if (advancing)
                return;
            setAdvancing(true);
            const startedAt = Date.now();
            try {
                const response = await fetch('/dsh-agent-workflow/transition', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ id: nodeInfo.workflowId, nodeId: nodeInfo.nodeId, to }),
                });
                const payload = await response.json().catch(() => null);
                // 前置条件没满足（方案没写 / 清单没勾完）时后端会拒绝，这里必须让人看见原因。
                if (payload === null || payload.ok !== true) {
                    const reason = payload?.error ?? `推进被拒绝（HTTP ${response.status}）`;
                    window.alert(String(reason));
                    return;
                }
                // 通知侧栏会话行的状态点刷新（清缓存并重取）。
                window.dispatchEvent(new Event('dsh-workflow-state-changed'));
                const info = await readNode();
                if (info !== null)
                    await applyEnterTrigger(info.enterTrigger);
                if (info !== null && info.state === 'implementing')
                    void readChecklist(info.workflowId, info.nodeId);
                else
                    setChecklist([]);
                console.info(`[dsh-agent-workflow] 推进成功 (to=${to}, ${Date.now() - startedAt}ms)`);
            }
            catch (error) {
                console.error('[dsh-agent-workflow] 推进状态失败：', error);
            }
            finally {
                setAdvancing(false);
            }
        };
        /** 推进：进入实现中前若方案没写，先弹确认。 */
        const advance = async () => {
            if (nextState === null || advancing)
                return;
            if (nextState === 'implementing') {
                const meta = await readChecklist(nodeInfo.workflowId, nodeInfo.nodeId);
                if (!meta.hasPlan) {
                    setConfirmOpen(true);
                    return;
                }
            }
            void transitionTo(nextState);
        };
        /** 同意 / 拒绝模型发起的推进请求（状态只由这里或手动 → 改变）。 */
        const respondAdvance = async (accept) => {
            try {
                const response = await fetch('/dsh-agent-workflow/approve-advance', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ sessionId, accept }),
                });
                const payload = await response.json().catch(() => null);
                if (payload?.ok !== true) {
                    window.alert(String(payload?.error ?? '处理推进请求失败'));
                    return;
                }
                window.dispatchEvent(new Event('dsh-workflow-state-changed'));
                const info = await readNode();
                if (accept && info !== null)
                    await applyEnterTrigger(info.enterTrigger);
                if (info !== null && info.state === 'implementing')
                    void readChecklist(info.workflowId, info.nodeId);
            }
            catch (error) {
                console.error('[dsh-agent-workflow] 处理推进请求失败：', error);
            }
        };
        const doneCount = checklist.filter((item) => item.done).length;
        const backwardStates = BACKWARD_STATES[nodeInfo.state] ?? [];
        return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", title: "\u67E5\u770B\u672C\u8282\u70B9\u7684\u64CD\u4F5C\u7EC6\u8282 / \u5DE5\u4F5C\u624B\u518C", onClick: () => setDetailOpen(true), style: {
                                display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 8px',
                                borderRadius: 6, border: '1px solid transparent', background: 'var(--dsw-alias-bg-layer-1)',
                                color: 'var(--dsw-alias-label-secondary)', fontSize: 11, lineHeight: '22px',
                                whiteSpace: 'nowrap', cursor: 'pointer',
                            }, onMouseEnter: (event) => { event.currentTarget.style.borderColor = 'var(--dsw-alias-border-l1)'; }, onMouseLeave: (event) => { event.currentTarget.style.borderColor = 'transparent'; }, children: [(0, jsx_runtime_1.jsx)("span", { style: { width: 6, height: 6, borderRadius: '50%', display: 'block', background: node_state_color_1.NODE_STATE_COLOR[nodeInfo.state] ?? 'transparent' } }), label] }), nodeInfo.pendingAdvance !== null ? ((0, jsx_runtime_1.jsxs)("span", { style: {
                                display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 8px',
                                borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)',
                                fontSize: 11, lineHeight: '22px', whiteSpace: 'nowrap',
                            }, children: [(0, jsx_runtime_1.jsxs)("span", { style: { color: 'var(--dsw-alias-label-secondary)' }, children: ["\u8BF7\u6C42 \u2192 ", node_state_label_1.NODE_STATE_LABEL[nodeInfo.pendingAdvance.to] ?? nodeInfo.pendingAdvance.to] }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => void respondAdvance(true), style: {
                                        height: 22, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                                        color: 'var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary))', fontSize: 11, lineHeight: '22px',
                                    }, children: "\u540C\u610F" }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => void respondAdvance(false), style: {
                                        height: 22, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                                        color: 'var(--dsw-alias-label-secondary)', fontSize: 11, lineHeight: '22px',
                                    }, children: "\u62D2\u7EDD" })] })) : null, nodeInfo.state === 'implementing' && checklist.length > 0 ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", title: "\u5B9E\u65BD\u8FDB\u5EA6\uFF08AI \u81EA\u52A8\u52FE\u9009\uFF0C\u53EA\u8BFB\uFF09", onClick: (event) => {
                                        event.currentTarget.focus({ preventScroll: true });
                                        const point = (0, menu_anchor_1.menuPointFromEvent)(event);
                                        setChecklistMenu((current) => (current === null ? point : null));
                                    }, style: {
                                        display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px',
                                        borderRadius: 6, border: '1px solid transparent', background: 'var(--dsw-alias-bg-layer-1)',
                                        color: doneCount === checklist.length ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary))',
                                        fontSize: 11, lineHeight: '22px', whiteSpace: 'nowrap', cursor: 'pointer',
                                    }, onMouseEnter: (event) => { event.currentTarget.style.borderColor = 'var(--dsw-alias-border-l1)'; }, onMouseLeave: (event) => { event.currentTarget.style.borderColor = 'transparent'; }, children: ["\u5B9E\u65BD ", doneCount, "/", checklist.length] }), checklistMenu !== null ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, align: "end", getAnchorRect: () => (0, menu_anchor_1.menuAnchorRect)(checklistMenu), items: checklist.map((item) => ({ id: item.label, label: `${item.done ? '✓' : '○'}  ${item.label}` })), onClose: () => setChecklistMenu(null), onSelect: () => setChecklistMenu(null) })) : null] })) : null, backwardStates.length > 0 ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u8FD4\u5DE5\uFF08\u9000\u56DE\u4E0A\u4E00\u9636\u6BB5\uFF09", side: "top", delayMs: 400, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": "\u8FD4\u5DE5", disabled: advancing, onClick: (event) => {
                                            event.currentTarget.focus({ preventScroll: true });
                                            const point = (0, menu_anchor_1.menuPointFromEvent)(event);
                                            setBackwardMenu((current) => (current === null ? point : null));
                                        }, style: {
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22,
                                            border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, background: 'transparent',
                                            color: 'var(--dsw-alias-label-secondary)', cursor: advancing ? 'progress' : 'pointer',
                                            opacity: advancing ? 0.6 : 1,
                                        }, children: (0, jsx_runtime_1.jsxs)("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("path", { d: "M19 12H6" }), (0, jsx_runtime_1.jsx)("path", { d: "m11.5 6-6 6 6 6" })] }) }) }), backwardMenu !== null ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, align: "end", getAnchorRect: () => (0, menu_anchor_1.menuAnchorRect)(backwardMenu), items: backwardStates.map((state) => ({
                                        id: state,
                                        label: `返工到 ${node_state_label_1.NODE_STATE_LABEL[state] ?? state}`,
                                    })), onClose: () => setBackwardMenu(null), onSelect: (id) => {
                                        setBackwardMenu(null);
                                        void transitionTo(id);
                                    } })) : null] })) : null, nextState === null ? null : ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: `推进到 ${node_state_label_1.NODE_STATE_LABEL[nextState] ?? nextState}`, side: "top", delayMs: 400, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": "\u63A8\u8FDB\u5230\u4E0B\u4E00\u9636\u6BB5", disabled: advancing, onClick: () => void advance(), style: {
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22,
                                    border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, background: 'transparent',
                                    color: 'var(--dsw-alias-label-secondary)', cursor: advancing ? 'progress' : 'pointer',
                                    opacity: advancing ? 0.6 : 1,
                                }, children: (0, jsx_runtime_1.jsxs)("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("path", { d: "M5 12h13" }), (0, jsx_runtime_1.jsx)("path", { d: "m12.5 6 6 6-6 6" })] }) }) }))] }), (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [detailOpen ? ((0, jsx_runtime_1.jsx)(workflow_dialogs_1.WorkflowNodeDetailDialog, { workflowId: nodeInfo.workflowId, nodeId: nodeInfo.nodeId, onClose: () => setDetailOpen(false), onOpenSettings: () => {
                                setReturnToDetail(true);
                                setDetailOpen(false);
                                setSettingsOpen(true);
                            } })) : null, settingsOpen ? ((0, jsx_runtime_1.jsx)(workflow_dialogs_1.WorkflowSettingsDialog, { onClose: () => {
                                setSettingsOpen(false);
                                if (returnToDetail) {
                                    setReturnToDetail(false);
                                    setDetailOpen(true);
                                }
                            } })) : null, confirmOpen ? ((0, jsx_runtime_1.jsx)(workflow_dialogs_1.WorkflowConfirmDialog, { title: "\u8FDB\u5165\u5B9E\u73B0\u4E2D", message: '这个节点的工作手册里还没写「方案」小节，直接进入实现中可能没有执行依据。\n\n· 点「仍进入」直接推进\n· 点「取消」回讨论中继续完善方案。', confirmLabel: "\u4ECD\u8FDB\u5165", onClose: () => setConfirmOpen(false), onConfirm: () => {
                                setConfirmOpen(false);
                                void transitionTo(nextState);
                            } })) : null] }), document.body)] }));
    }
    /** 把状态徽标挂到输入框工具条的左侧控件区（权限控件的右边）。 */
    function applyWorkflowComposerBadge(ctx) {
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
            name: 'conversation.input.left',
            id: 'dsh-agent-workflow.state',
            order: 10,
            label: 'workflow 状态',
        }, WorkflowStateBadge));
    }
    //# sourceMappingURL=workflow-embedded.js.map
    },
    "schema/node-state-label.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.NODE_STATE_LABEL = void 0;
    /**
     * 状态中文名（UI 显示用）。
     *
     * 单独成文件的原因：客户端半（浏览器）要用这张表，但 `node-state.ts` 里
     * 有 zod 的运行时依赖，客户端模块表并不提供 zod。客户端只从这里取值，
     * 就不会把 zod 拖进浏览器包（否则整个客户端 entry 会在启动时失败）。
     */
    exports.NODE_STATE_LABEL = {
        discussing: '讨论中',
        implementing: '实现中',
        verifying: '验收中',
        completed: '已完结',
    };
    //# sourceMappingURL=node-state-label.js.map
    },
    "client/workflow-dialogs.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.applyWorkflowSettingsSection = applyWorkflowSettingsSection;
    exports.WorkflowSettingsDialog = WorkflowSettingsDialog;
    exports.WorkflowConfirmDialog = WorkflowConfirmDialog;
    exports.WorkflowNodeDetailDialog = WorkflowNodeDetailDialog;
    const jsx_runtime_1 = require("react/jsx-runtime");
    // @ts-nocheck
    /**
     * workflow 的界面块：
     * - 设置页里的「操作细节」分区（应用级全局 A + B/C/D，四个页签）；
     * - 节点操作细节弹窗（只读展示该节点生效的 A + B/C/D，标出覆盖项）。
     *
     * 样式全部用主题变量内联，深浅色自动跟随，不依赖 CSS Module。
     */
    const react_1 = require("react");
    const node_state_label_1 = __req("schema/node-state-label.js");
    const hard_rules_1 = __req("schema/hard-rules.js");
    const node_state_color_1 = __req("client/node-state-color.js");
    const LABEL_STYLE = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4, display: 'block' };
    /**
     * 「切换状态时自动发送默认输入」勾选框是否显示。
     * 交互还没定清楚（自动发送会对输入框现有内容动手），先屏蔽 UI；后端接口与自动发送逻辑保留，
     * 想恢复把这里改成 true 即可。
     */
    const AUTO_SEND_SETTING_VISIBLE = false;
    const FIELD_STYLE = {
        width: '100%',
        boxSizing: 'border-box',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        padding: '6px 8px',
        fontSize: 12,
        lineHeight: 1.5,
        resize: 'vertical',
        fontFamily: 'inherit',
    };
    const OVERLAY_STYLE = { position: 'fixed', inset: 0, zIndex: 1199, background: 'rgba(0,0,0,.45)' };
    /** 纯文字链接按钮：无边框无底色，靠下划线区分（颜色跟随主题文字色）。 */
    const TEXT_LINK_STYLE = {
        height: 22,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: 12,
        color: 'var(--dsw-alias-label-primary)',
        textDecoration: 'underline',
        textUnderlineOffset: '2px',
    };
    const PANEL_STYLE = {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 560,
        maxWidth: '92vw',
        maxHeight: '82vh',
        overflow: 'auto',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 10,
        padding: 16,
        boxShadow: '0 12px 32px rgba(0,0,0,.4)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
        zIndex: 1200,
    };
    function Modal(props) {
        const fixed = props.fixedHeight !== undefined;
        const panelStyle = fixed
            ? {
                ...PANEL_STYLE,
                height: props.fixedHeight,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }
            : PANEL_STYLE;
        return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { style: OVERLAY_STYLE, onClick: props.onClose }), (0, jsx_runtime_1.jsxs)("div", { style: panelStyle, role: "dialog", "aria-label": props.title, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flex: '0 0 auto' }, children: [(0, jsx_runtime_1.jsx)("strong", { style: { fontSize: 14 }, children: props.title }), (0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": "\u5173\u95ED", onClick: props.onClose, style: { border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }, children: "\u00D7" })] }), fixed ? ((0, jsx_runtime_1.jsx)("div", { style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto' }, children: props.children })) : props.children] })] }));
    }
    const STATE_TABS = [
        { id: 'shared', label: '公共' },
        { id: 'discussing', label: '讨论中' },
        { id: 'implementing', label: '实现中' },
        { id: 'verifying', label: '验收中' },
    ];
    /** 节点弹窗的三个页签：操作细节 / 会话手册 / 项目手册。 */
    const NODE_DETAIL_TABS = [
        { id: 'detail', label: '会话操作细节' },
        { id: 'sessionManual', label: '会话手册' },
        { id: 'globalManual', label: '项目手册' },
    ];
    /**
     * 设置页里的「操作细节」分区内容。
     * A/B/C/D 四个页签横向排开；每个状态页签内：默认输入在上（20%），操作细节在下（80%）。
     */
    /** 阶段硬规则面板：默认收起（只留标题行），点「展开」看全文；点「改写」先警告，确认后才解锁编辑。 */
    function HardRulePanel(props) {
        const [unlocked, setUnlocked] = (0, react_1.useState)(false);
        const [expanded, setExpanded] = (0, react_1.useState)(false);
        const label = props.state === 'discussing' ? '讨论中' : props.state === 'implementing' ? '实现中' : '验收中';
        const showBody = expanded || unlocked;
        return ((0, jsx_runtime_1.jsxs)("div", { style: {
                marginTop: 8,
                border: '1px solid var(--dsw-alias-border-l1)',
                borderRadius: 8,
                padding: '5px 8px',
                background: 'var(--dsw-alias-bg-base)',
            }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, children: [(0, jsx_runtime_1.jsxs)("span", { style: { fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: ["\u672C\u9636\u6BB5\u786C\u89C4\u5219\uFF08\u63D2\u4EF6\u5C42\uFF0C\u53EA\u8BFB\uFF09\u00B7 ", label] }), (0, jsx_runtime_1.jsxs)("span", { style: { display: 'flex', gap: 10, flexShrink: 0 }, children: [props.overridden ? ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: props.onReset, style: { border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', textDecoration: 'underline' }, children: "\u6062\u590D\u9ED8\u8BA4" })) : null, (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setExpanded((value) => !value), style: { border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', textDecoration: 'underline' }, children: showBody ? '收起' : '展开' }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => { setUnlocked((value) => !value); setExpanded(true); }, style: { border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 11.5, color: 'var(--dsw-alias-brand-primary)', textDecoration: 'underline' }, children: unlocked ? '完成改写' : '改写硬规则' })] })] }), showBody ? ((0, jsx_runtime_1.jsx)("div", { style: { marginTop: 5 }, children: unlocked ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11.5, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5, marginBottom: 4 }, children: "\u26A0 \u786C\u89C4\u5219\u7528\u4E8E\u9636\u6BB5\u63A8\u8FDB\u6821\u9A8C\uFF08\u65B9\u6848\u662F\u5426\u5199\u8FDB\u624B\u518C\u3001\u6E05\u5355\u662F\u5426\u5168\u52FE\uFF09\u3002\u6539\u4E86\u53EF\u80FD\u5BFC\u81F4\u6821\u9A8C\u4E0E\u4F60\u7684\u9884\u671F\u4E0D\u7B26\uFF0C\u786E\u8BA4\u540E\u518D\u6539\u3002" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, minHeight: 80 }, value: props.value, onChange: (event) => props.onChange(event.target.value) })] })) : ((0, jsx_runtime_1.jsx)("div", { style: { whiteSpace: 'pre-wrap', fontSize: 11.5, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)', maxHeight: 96, overflow: 'auto' }, children: props.value })) })) : null] }));
    }
    function WorkflowGlobalSettingsSection() {
        const [detail, setDetail] = (0, react_1.useState)(null);
        const [defaults, setDefaults] = (0, react_1.useState)(null);
        const [autoSend, setAutoSend] = (0, react_1.useState)(false);
        const [activeTab, setActiveTab] = (0, react_1.useState)('shared');
        const [status, setStatus] = (0, react_1.useState)('idle');
        const [error, setError] = (0, react_1.useState)(null);
        const timerRef = (0, react_1.useRef)(null);
        const latestRef = (0, react_1.useRef)(null);
        (0, react_1.useEffect)(() => {
            let cancelled = false;
            void (async () => {
                try {
                    const response = await fetch('/dsh-agent-workflow/global-settings');
                    const responseBody = await response.json().catch(() => null);
                    if (cancelled)
                        return;
                    if (responseBody?.ok === true) {
                        setDetail(responseBody.globalOperationDetail);
                        setDefaults(responseBody.defaults ?? null);
                    }
                    else
                        setError(String(responseBody?.error ?? '读取设置失败'));
                }
                catch (reason) {
                    if (!cancelled)
                        setError(String(reason));
                }
            })();
            return () => { cancelled = true; };
        }, []);
        // 应用级开关：切换状态时是否自动发送默认输入（默认关闭）。
        (0, react_1.useEffect)(() => {
            let cancelled = false;
            void (async () => {
                try {
                    const response = await fetch('/dsh-agent-workflow/app-settings');
                    const responseBody = await response.json().catch(() => null);
                    if (!cancelled && responseBody?.ok === true)
                        setAutoSend(responseBody.autoSendEnterTrigger === true);
                }
                catch {
                    // 读不到就按默认（关闭）。
                }
            })();
            return () => { cancelled = true; };
        }, []);
        const saveAutoSend = async (next) => {
            setAutoSend(next);
            try {
                await fetch('/dsh-agent-workflow/app-settings-save', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ autoSendEnterTrigger: next }),
                });
            }
            catch (reason) {
                console.warn('[dsh-agent-workflow] 保存自动发送开关失败：', reason);
            }
        };
        /** 真正落盘：只由防抖计时器或卸载时的兜底调用。 */
        const persist = async (value) => {
            setStatus('saving');
            setError(null);
            try {
                const response = await fetch('/dsh-agent-workflow/global-settings-save', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ globalOperationDetail: value }),
                });
                const responseBody = await response.json().catch(() => null);
                if (responseBody?.ok === true) {
                    setStatus('saved');
                    window.setTimeout(() => setStatus((current) => (current === 'saved' ? 'idle' : current)), 1600);
                }
                else {
                    setStatus('error');
                    setError(String(responseBody?.error ?? '保存失败'));
                }
            }
            catch (reason) {
                setStatus('error');
                setError(String(reason));
            }
        };
        /** 改动即排一次防抖保存（700ms），不需要「保存」按钮。 */
        const update = (next) => {
            setDetail(next);
            latestRef.current = next;
            setStatus('pending');
            setError(null);
            if (timerRef.current !== null)
                clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => {
                timerRef.current = null;
                void persist(next);
            }, 700);
        };
        /** 恢复出厂默认：用服务端返回的默认值覆盖当前全部操作细节，并清掉硬规则覆盖值。 */
        const restoreFactoryDefaults = () => {
            if (defaults === null)
                return;
            const confirmed = window.confirm('恢复出厂默认？会覆盖当前所有操作细节（公共 / 讨论中 / 实现中 / 验收中），硬规则覆盖值也会一起清掉。');
            if (!confirmed)
                return;
            update({ ...defaults, hard_rules: {} });
        };
        // 卸载（关设置页）时把还没落盘的改动补写一次，避免丢最后几个字。
        (0, react_1.useEffect)(() => () => {
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
                if (latestRef.current !== null)
                    void persist(latestRef.current);
            }
        }, []);
        if (detail === null) {
            return (0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }, children: error ?? '加载中…' });
        }
        const patchTab = (tabId, patch) => (update({ ...detail, [tabId]: { ...detail[tabId], ...patch } }));
        return ((0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginBottom: 12 }, children: "\u8FD9\u4E9B\u64CD\u4F5C\u7EC6\u8282\u662F\u5E94\u7528\u7EA7\u5168\u5C40\u7684\uFF0C\u6240\u6709 workflow \u8282\u70B9\u5728\u5BF9\u5E94\u72B6\u6001\u4E0B\u90FD\u4F1A\u8BFB\u5230\uFF1B\u8282\u70B9\u53EF\u4EE5\u5355\u72EC\u8986\u76D6\u81EA\u5DF1\u5F53\u524D\u72B6\u6001\u90A3\u4E00\u6761\u3002" }), AUTO_SEND_SETTING_VISIBLE ? ((0, jsx_runtime_1.jsxs)("label", { style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 12,
                        fontSize: 12,
                        color: 'var(--dsw-alias-label-secondary)',
                        cursor: 'pointer',
                    }, children: [(0, jsx_runtime_1.jsx)("input", { type: "checkbox", checked: autoSend, onChange: (event) => { void saveAutoSend(event.target.checked); } }), "\u5207\u6362\u72B6\u6001\u65F6\u81EA\u52A8\u53D1\u9001\u9ED8\u8BA4\u8F93\u5165\uFF08\u5F53\u524D\u662F\u53EA\u586B\u5165\u8F93\u5165\u6846\u3001\u4E0D\u53D1\u9001\uFF1B\u9ED8\u8BA4\u5173\u95ED\uFF09"] })) : null, (0, jsx_runtime_1.jsxs)("div", { style: {
                        border: '1px solid var(--dsw-alias-border-l1)',
                        borderRadius: 8,
                        background: 'var(--dsw-alias-bg-base)',
                        padding: '10px 12px',
                        marginBottom: 12,
                    }, children: [(0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, children: node_state_color_1.WORKFLOW_FLOW.map((item, index) => ((0, jsx_runtime_1.jsxs)("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [(0, jsx_runtime_1.jsx)("span", { style: {
                                            width: 7,
                                            height: 7,
                                            borderRadius: '50%',
                                            background: node_state_color_1.NODE_STATE_COLOR[item.state],
                                            display: 'inline-block',
                                        } }), (0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'nowrap' }, children: item.label }), index < node_state_color_1.WORKFLOW_FLOW.length - 1 ? ((0, jsx_runtime_1.jsx)("span", { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginLeft: 2 }, children: "\u2192" })) : null] }, item.state))) }), (0, jsx_runtime_1.jsx)("div", { style: { marginTop: 6, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }, children: "\u8FD4\u5DE5\uFF08\u9000\u56DE\u4E0A\u4E00\u9636\u6BB5\uFF09\uFF1A\u5B9E\u73B0\u4E2D \u2192 \u8BA8\u8BBA\u4E2D\uFF1B\u9A8C\u6536\u4E2D \u2192 \u5B9E\u73B0\u4E2D / \u8BA8\u8BBA\u4E2D" })] }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', gap: 4, borderBottom: '1px solid var(--dsw-alias-border-l1)', marginBottom: 12 }, children: STATE_TABS.map((tab) => ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setActiveTab(tab.id), style: {
                            padding: '6px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid var(--dsw-alias-brand-primary)' : '2px solid transparent',
                            color: activeTab === tab.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                            cursor: 'pointer',
                            fontSize: 12,
                        }, children: tab.label }, tab.id))) }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', flexDirection: 'column', height: 380 }, children: activeTab === 'shared' ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u516C\u5171\u64CD\u4F5C\u7EC6\u8282 \u00B7 \u4E09\u6001\u901A\u7528" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '1 1 auto' }, value: detail.shared_detail ?? '', onChange: (event) => update({ ...detail, shared_detail: event.target.value }) })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u8FDB\u5165\u8BE5\u72B6\u6001\u540E\u81EA\u52A8\u704C\u5165\u8F93\u5165\u6846\u7684\u9ED8\u8BA4\u6587\u672C\uFF08\u53EF\u7A7A\uFF09" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '0 0 20%', resize: 'none' }, value: detail[activeTab]?.enter_trigger ?? '', placeholder: "\u7559\u7A7A\u5219\u4E0D\u81EA\u52A8\u704C\u5165", onChange: (event) => patchTab(activeTab, { enter_trigger: event.target.value === '' ? null : event.target.value }) }), (0, jsx_runtime_1.jsx)("label", { style: { ...LABEL_STYLE, marginTop: 10 }, children: "\u8BE5\u72B6\u6001\u7684\u64CD\u4F5C\u7EC6\u8282" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '1 1 auto', minHeight: 80 }, value: detail[activeTab]?.operation_detail ?? '', onChange: (event) => patchTab(activeTab, { operation_detail: event.target.value }) }), activeTab === 'discussing' || activeTab === 'implementing' || activeTab === 'verifying' ? ((0, jsx_runtime_1.jsx)(HardRulePanel, { state: activeTab, value: detail.hard_rules?.[activeTab] ?? hard_rules_1.DEFAULT_HARD_RULES[activeTab], overridden: detail.hard_rules?.[activeTab] !== undefined, onChange: (next) => update({ ...detail, hard_rules: { ...(detail.hard_rules ?? {}), [activeTab]: next } }), onReset: () => {
                                    const next = { ...(detail.hard_rules ?? {}) };
                                    delete next[activeTab];
                                    update({ ...detail, hard_rules: next });
                                } })) : null] })) }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: status === 'pending' ? '待保存…'
                                : status === 'saving' ? '保存中…'
                                    : status === 'saved' ? '已自动保存'
                                        : status === 'error' ? '' : '改动会自动保存' }), error !== null ? (0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }, children: error }) : null, (0, jsx_runtime_1.jsx)("span", { style: { marginLeft: 'auto' }, children: (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: restoreFactoryDefaults, disabled: defaults === null, style: {
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid var(--dsw-alias-border-l1)',
                                    background: 'transparent',
                                    color: 'var(--dsw-alias-label-secondary)',
                                    cursor: defaults === null ? 'not-allowed' : 'pointer',
                                    fontSize: 12,
                                }, children: "\u6062\u590D\u51FA\u5382\u9ED8\u8BA4" }) })] })] }));
    }
    /** 设置左侧导航里的图标（与侧栏 workflow 工作区同一套树形图标）。 */
    function WorkflowSectionIcon() {
        return ((0, jsx_runtime_1.jsxs)("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("rect", { x: "9", y: "3", width: "6", height: "4", rx: "1" }), (0, jsx_runtime_1.jsx)("rect", { x: "3", y: "16", width: "6", height: "4", rx: "1" }), (0, jsx_runtime_1.jsx)("rect", { x: "15", y: "16", width: "6", height: "4", rx: "1" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 7v3" }), (0, jsx_runtime_1.jsx)("path", { d: "M6 16v-1.6A1.4 1.4 0 0 1 7.4 13h9.2a1.4 1.4 0 0 1 1.4 1.4V16" })] }));
    }
    /** 把「操作细节」分区挂进 设置 → 左侧导航。 */
    function applyWorkflowSettingsSection(ctx) {
        const sectionId = 'dsh-agent-workflow';
        ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: sectionId,
            order: 50,
            label: 'Agent 工作流',
        }, WorkflowGlobalSettingsSection));
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({ name: 'settings.section.icon', id: sectionId }, WorkflowSectionIcon));
    }
    /** 全局操作细节的独立弹窗版（与设置页共用同一个编辑组件）。 */
    function WorkflowSettingsDialog(props) {
        return ((0, jsx_runtime_1.jsx)(Modal, { title: "\u64CD\u4F5C\u7EC6\u8282\u8BBE\u7F6E\uFF08\u5168\u5C40\uFF09", onClose: props.onClose, children: (0, jsx_runtime_1.jsx)(WorkflowGlobalSettingsSection, {}) }));
    }
    /** 通用二次确认弹窗：删除工作区等不可逆操作前先过一层。 */
    function WorkflowConfirmDialog(props) {
        return ((0, jsx_runtime_1.jsxs)(Modal, { title: props.title, onClose: props.onClose, children: [(0, jsx_runtime_1.jsx)("div", { style: { whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary)', marginBottom: 16 }, children: props.message }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 }, children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: props.onClose, style: {
                                height: 28,
                                padding: '0 14px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 12,
                                border: '1px solid var(--dsw-alias-border-l1)',
                                background: 'transparent',
                                color: 'var(--dsw-alias-label-primary)',
                            }, children: "\u53D6\u6D88" }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: props.onConfirm, style: {
                                height: 28,
                                padding: '0 14px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 12,
                                // 不填充实色：某些主题没定义对应 token，实色 + #fff 会变成"白底白字"。
                                border: '1px solid var(--dsw-alias-state-error-primary)',
                                background: 'transparent',
                                color: 'var(--dsw-alias-state-error-primary)',
                            }, children: props.confirmLabel })] })] }));
    }
    /** 节点补充说明弹窗：只编辑这个节点自己的附加说明，全局内容去设置里看。 */
    function WorkflowNodeDetailDialog(props) {
        const { workflowId, nodeId, onClose, onOpenSettings } = props;
        const [payload, setPayload] = (0, react_1.useState)(null);
        const [error, setError] = (0, react_1.useState)(null);
        const [manualData, setManualData] = (0, react_1.useState)(null);
        (0, react_1.useEffect)(() => {
            let cancelled = false;
            void (async () => {
                try {
                    const response = await fetch(`/dsh-agent-workflow/node-detail?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
                    const responseBody = await response.json().catch(() => null);
                    if (cancelled)
                        return;
                    if (responseBody?.ok === true)
                        setPayload(responseBody);
                    else
                        setError(String(responseBody?.error ?? '读取失败'));
                }
                catch (reason) {
                    if (!cancelled)
                        setError(String(reason));
                }
            })();
            return () => { cancelled = true; };
        }, [workflowId, nodeId]);
        // 会话手册（方案/实施顺序） + 项目手册（总览/决策/要点）只读展示。
        (0, react_1.useEffect)(() => {
            let cancelled = false;
            void (async () => {
                try {
                    const response = await fetch(`/dsh-agent-workflow/node-manual?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
                    const responseBody = await response.json().catch(() => null);
                    if (cancelled || responseBody?.ok !== true)
                        return;
                    setManualData(responseBody.manual === null
                        ? null
                        : {
                            manual: String(responseBody.manual?.manual ?? ''),
                            notesDir: String(responseBody.manual?.notesDir ?? ''),
                            globalManual: String(responseBody.globalManual ?? ''),
                        });
                }
                catch {
                    // 读不到就不展示。
                }
            })();
            return () => { cancelled = true; };
        }, [workflowId, nodeId]);
        const currentState = payload?.node?.current_state ?? null;
        const labels = { discussing: '讨论中', implementing: '实现中', verifying: '验收中' };
        const [notes, setNotes] = (0, react_1.useState)({});
        const [noteStatus, setNoteStatus] = (0, react_1.useState)(null);
        const [activeTab, setActiveTab] = (0, react_1.useState)('detail');
        const timers = (0, react_1.useRef)({});
        // 读到数据后把节点自己的附加说明灌进本地草稿。
        (0, react_1.useEffect)(() => {
            if (payload === null)
                return;
            setNotes({
                global: String(payload.additional?.global ?? ''),
                discussing: String(payload.additional?.discussing ?? ''),
                implementing: String(payload.additional?.implementing ?? ''),
                verifying: String(payload.additional?.verifying ?? ''),
            });
        }, [payload]);
        /** 附加说明：防抖 700ms 自动保存到该节点，不影响全局设置。 */
        const saveNote = (state, text) => {
            setNotes((current) => ({ ...current, [state]: text }));
            if (timers.current[state] !== undefined)
                clearTimeout(timers.current[state]);
            setNoteStatus('待保存…');
            timers.current[state] = window.setTimeout(async () => {
                timers.current[state] = undefined;
                setNoteStatus('保存中…');
                try {
                    const response = await fetch('/dsh-agent-workflow/node-note', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ id: workflowId, nodeId, state, text }),
                    });
                    const responseBody = await response.json().catch(() => null);
                    setNoteStatus(responseBody?.ok === true ? '已保存' : String(responseBody?.error ?? '保存失败'));
                }
                catch (reason) {
                    setNoteStatus(String(reason));
                }
            }, 700);
        };
        return ((0, jsx_runtime_1.jsxs)(Modal, { title: `节点补充说明 · ${payload?.node?.title ?? '节点'}`, onClose: onClose, fixedHeight: 680, children: [error !== null ? (0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-state-error-primary)' }, children: error }) : null, payload === null ? ((0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)' }, children: "\u52A0\u8F7D\u4E2D\u2026" })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }, children: [(0, jsx_runtime_1.jsxs)("span", { style: { color: 'var(--dsw-alias-label-secondary)' }, children: ["\u5F53\u524D\u72B6\u6001\uFF1A", node_state_label_1.NODE_STATE_LABEL[currentState] ?? currentState, noteStatus === null ? '' : `　${noteStatus}`] }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => {
                                        // 先关掉当前弹窗，再让上层打开设置：避免两层遮罩叠在一起。
                                        onOpenSettings?.();
                                        onClose();
                                    }, style: TEXT_LINK_STYLE, children: "\u6253\u5F00\u64CD\u4F5C\u7EC6\u8282\u8BBE\u7F6E" }), manualData !== null && manualData.notesDir !== '' ? ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => {
                                        void fetch('/dsh-agent-workflow/open-folder', {
                                            method: 'POST',
                                            headers: { 'content-type': 'application/json' },
                                            body: JSON.stringify({ path: manualData.notesDir }),
                                        });
                                    }, style: TEXT_LINK_STYLE, children: "\u6253\u5F00\u6587\u4EF6\u5939" })) : null] }), (0, jsx_runtime_1.jsx)("div", { style: {
                                position: 'sticky',
                                top: 0,
                                zIndex: 2,
                                background: 'var(--dsw-alias-bg-layer-1)',
                                paddingBottom: 12,
                            }, children: (0, jsx_runtime_1.jsx)("div", { style: {
                                    display: 'flex',
                                    gap: 4,
                                    padding: 4,
                                    background: 'var(--dsw-alias-bg-base)',
                                    border: '1px solid var(--dsw-alias-border-l1)',
                                    borderRadius: 9,
                                }, children: NODE_DETAIL_TABS.map((tab) => ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setActiveTab(tab.id), style: {
                                        flex: '1 1 0',
                                        padding: '7px 10px',
                                        borderRadius: 6,
                                        border: 'none',
                                        background: activeTab === tab.id ? 'var(--dsw-alias-brand-primary)' : 'transparent',
                                        color: activeTab === tab.id ? 'var(--dsw-alias-bg-base)' : 'var(--dsw-alias-label-secondary)',
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        fontWeight: activeTab === tab.id ? 600 : 400,
                                    }, children: tab.label }, tab.id))) }) }), activeTab === 'detail' ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginBottom: 10 }, children: "\u5168\u5C40\u7684\u64CD\u4F5C\u7EC6\u8282\u5728\u300C\u8BBE\u7F6E \u2192 Agent \u5DE5\u4F5C\u6D41\u300D\u91CC\uFF1B\u8FD9\u91CC\u53EA\u5199\u8FD9\u4E2A\u8282\u70B9\u989D\u5916\u8981\u6CE8\u610F\u7684\uFF0C\u4F1A\u63A5\u5728\u5168\u5C40\u540E\u9762\u3002" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                        border: '1px solid var(--dsw-alias-border-l1)',
                                        borderRadius: 8,
                                        padding: 10,
                                        marginBottom: 10,
                                    }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "\u672C\u8282\u70B9\u9644\u52A0\uFF08\u6240\u6709\u72B6\u6001\u90FD\u4F1A\u8FFD\u52A0\uFF09" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, minHeight: 52 }, placeholder: "\u7559\u7A7A\u5219\u4E0D\u8FFD\u52A0", value: notes.global ?? '', onChange: (event) => saveNote('global', event.target.value) })] }), ['discussing', 'implementing', 'verifying'].map((state) => {
                                    return ((0, jsx_runtime_1.jsxs)("div", { style: {
                                            border: '1px solid var(--dsw-alias-border-l1)',
                                            borderRadius: 8,
                                            padding: 10,
                                            marginBottom: 10,
                                            background: currentState === state ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                                        }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: [labels[state], currentState === state ? (0, jsx_runtime_1.jsx)("span", { style: { marginLeft: 6, fontSize: 11, color: 'var(--dsw-alias-brand-primary)' }, children: "\u5F53\u524D\u6001" }) : null] }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, minHeight: 52 }, placeholder: "\u7559\u7A7A\u5219\u4E0D\u8FFD\u52A0", value: notes[state] ?? '', onChange: (event) => saveNote(state, event.target.value) })] }, state));
                                }), payload?.node?.history !== undefined && payload.node.history.length > 0 ? ((0, jsx_runtime_1.jsxs)("div", { style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "\u72B6\u6001\u65F6\u95F4\u7EBF" }), payload.node.history.map((entry, index) => ((0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.7 }, children: [entry.at.slice(0, 16).replace('T', ' '), "\u3000", node_state_label_1.NODE_STATE_LABEL[entry.from] ?? entry.from, " \u2192 ", node_state_label_1.NODE_STATE_LABEL[entry.to] ?? entry.to] }, index)))] })) : null] })) : activeTab === 'sessionManual' ? ((0, jsx_runtime_1.jsxs)("div", { style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "\u4F1A\u8BDD\u624B\u518C\uFF08\u65B9\u6848 / \u5B9E\u65BD\u987A\u5E8F\uFF0CAI \u81EA\u7559\uFF0C\u53EA\u8BFB\uFF09" }), (0, jsx_runtime_1.jsx)("div", { style: { whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 380, overflow: 'auto', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: manualData === null ? '加载中…' : (manualData.manual.trim() !== '' ? manualData.manual : '（还没有内容）') })] })) : ((0, jsx_runtime_1.jsxs)("div", { style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "\u9879\u76EE\u624B\u518C\uFF08\u603B\u89C8 / \u51B3\u7B56 / \u8981\u70B9\uFF0CAI \u81EA\u7559\uFF0C\u53EA\u8BFB\uFF09" }), (0, jsx_runtime_1.jsx)("div", { style: { whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 380, overflow: 'auto', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: manualData === null ? '加载中…' : (manualData.globalManual.trim() !== '' ? manualData.globalManual : '（还没有内容）') })] }))] }))] }));
    }
    //# sourceMappingURL=workflow-dialogs.js.map
    },
    "schema/hard-rules.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DEFAULT_HARD_RULES = void 0;
    /**
     * 阶段硬规则默认文案。
     *
     * 单独放一个**无依赖**的模块：客户端设置页要显示默认值，不能通过 `schema/workflow.ts`
     * 把 zod 带进客户端包（smoke 会拦裸包）。
     */
    exports.DEFAULT_HARD_RULES = {
        discussing: `（收尾）讨论阶段不写手册也不会卡住，写不写由我决定；只有准备推进到实现中时，才把方案按「目标与验收 → 数据层 → 领域层 → 接口层 → 表现层」写进本节点会话手册的「方案」小节（每层写清层间契约），并在「实施顺序」里列出待办。推进需要我点同意，不要自己催。`,
        implementing: `（纪律）按会话手册「实施顺序」从下到上连续完成所有层：每完成一层，按该层「完成标准」自检，用 workflow_check 把证据写进清单，然后直接继续下一层，不要逐层等我确认。只有命中以下情况才停下来问我：① 方案有洞或自相矛盾，需要我拍板；② 该层自检失败，且无法在本层自行修复；③ 需要做超出方案范围的改动；④ 涉及删除 / 覆盖不可逆的数据或配置；⑤ 需要我提供外部资源（账号、文件、环境）。全部层完成后，一次性汇报每层做了什么、怎么验的、结果如何，然后请求进「验收中」。`,
        verifying: `（纪律）验收必须给可复跑的证据：每一项「通过」都要附命令 + 输出，或指向具体测试文件（路径 + 跑法）；没有可复跑证据的项标「未验证」，不算通过。`,
    };
    //# sourceMappingURL=hard-rules.js.map
    },
    "client/node-state-color.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WORKFLOW_FLOW = exports.NODE_STATE_COLOR = void 0;
    // @ts-nocheck
    /**
     * 四态状态色 + 流程顺序（徽标 / 侧栏状态点 / 设置页流程条 共用，避免三处各存一份）。
     *
     * 配色约定（对齐 Jira/GitHub 惯例）：讨论中=黄、实现中=蓝、验收中=紫、已完结=绿。
     * - 「实现中」用宿主实打实的蓝色 token（`brand-primary-new-colorprimary-new-color`），带 `#4176e6` 兜底；
     * - 「验收中」主题里没有紫色 token，直接硬编码 violet-500（#8b5cf6），深浅色下都可读。
     */
    exports.NODE_STATE_COLOR = {
        discussing: 'var(--dsw-alias-state-warn-primary)',
        implementing: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6)',
        verifying: '#8b5cf6',
        completed: 'var(--dsw-alias-state-success-primary)',
    };
    /** 设置页流程条用的顺序（含中文标签）。 */
    exports.WORKFLOW_FLOW = [
        { state: 'discussing', label: '讨论中' },
        { state: 'implementing', label: '实现中' },
        { state: 'verifying', label: '验收中' },
        { state: 'completed', label: '已完结' },
    ];
    //# sourceMappingURL=node-state-color.js.map
    },
    "client/menu-anchor.js": function(__req, module, exports) {
    "use strict";
    // @ts-nocheck
    /**
     * Menu 定位工具（从已删除的 workspace-ui 里保留下来的最小部分）。
     * 只依赖浏览器原生 DOMRect，供会话状态徽标里的清单菜单使用。
     */
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.menuPointFromEvent = menuPointFromEvent;
    exports.menuAnchorRect = menuAnchorRect;
    /**
     * 从点击事件里取「触发按钮左下角」的屏幕坐标。
     * 为什么不用 Menu 的 `anchor` 传元素：这个版本的 ui-primitives Menu 不测量 React 元素，
     * 只认 `getAnchorRect()`；传元素会让菜单落在默认位置（越靠下的行偏得越远）。
     */
    function menuPointFromEvent(event) {
        const rect = event?.currentTarget?.getBoundingClientRect?.();
        if (rect === undefined || rect === null)
            return { x: 8, y: 8 };
        return { x: rect.left, y: rect.bottom + 2 };
    }
    /** 把上面那个坐标包成 Menu 需要的零尺寸矩形。 */
    function menuAnchorRect(point) {
        return new DOMRect(point.x, point.y, 0, 0);
    }
    //# sourceMappingURL=menu-anchor.js.map
    },
    "client/session-row-dot.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.applySessionRowStateDots = applySessionRowStateDots;
    const jsx_runtime_1 = require("react/jsx-runtime");
    // @ts-nocheck
    /**
     * 侧栏会话行「行尾常驻状态点」：非悬停时始终显示一个按 workflow 状态着色的小圆点。
     *
     * - 挂在 sidebar.session.row.trailing（常驻图标位，非交互；悬停该行时宿主自动隐藏）。
     * - 数据走批量接口 /sidebar-nodes?path=…，一次拿整个工作区的节点状态，模块内 promise 缓存去重，
     *   5 秒 TTL；状态机推进后由 badge 派发 window 事件 `dsh-workflow-state-changed` 触发刷新。
     */
    const react_1 = require("react");
    const node_state_label_1 = __req("schema/node-state-label.js");
    const node_state_color_1 = __req("client/node-state-color.js");
    const CACHE_TTL_MS = 5000;
    const promiseCache = new Map();
    function getWorkspaceStates(path) {
        const cached = promiseCache.get(path);
        if (cached !== undefined)
            return cached;
        const promise = (async () => {
            try {
                const response = await fetch(`/dsh-agent-workflow/sidebar-nodes?path=${encodeURIComponent(path)}`);
                const responseBody = await response.json().catch(() => null);
                if (responseBody?.ok === true && typeof responseBody.nodes === 'object' && responseBody.nodes !== null) {
                    return responseBody.nodes;
                }
                return {};
            }
            catch {
                return {};
            }
        })();
        promiseCache.set(path, promise);
        window.setTimeout(() => {
            if (promiseCache.get(path) === promise)
                promiseCache.delete(path);
        }, CACHE_TTL_MS);
        return promise;
    }
    function SessionStateDot(props) {
        const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
        const cwd = typeof props?.useSessions === 'function'
            ? props.useSessions((s) => (s?.byId?.[sessionId]?.cwd ?? ''))
            : '';
        const [state, setState] = (0, react_1.useState)(null);
        (0, react_1.useEffect)(() => {
            if (sessionId === '' || cwd === '') {
                setState(null);
                return undefined;
            }
            let cancelled = false;
            const load = () => {
                void getWorkspaceStates(cwd).then((map) => {
                    if (!cancelled)
                        setState(map[sessionId] ?? null);
                });
            };
            load();
            const onChanged = () => {
                promiseCache.clear();
                load();
            };
            window.addEventListener('dsh-workflow-state-changed', onChanged);
            return () => {
                cancelled = true;
                window.removeEventListener('dsh-workflow-state-changed', onChanged);
            };
        }, [sessionId, cwd]);
        if (state === null)
            return null;
        const color = node_state_color_1.NODE_STATE_COLOR[state];
        if (color === undefined)
            return null;
        return ((0, jsx_runtime_1.jsx)("span", { "aria-hidden": true, title: node_state_label_1.NODE_STATE_LABEL[state] ?? state, style: {
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: color,
                display: 'inline-block',
            } }));
    }
    /** 把状态点注册到侧栏会话行的行尾常驻图标位。 */
    function applySessionRowStateDots(ctx) {
        ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register({
            name: 'sidebar.session.row.trailing',
            id: 'dsh-agent-workflow.state-dot',
            order: 10,
            label: 'workflow 状态点',
        }, SessionStateDot));
    }
    //# sourceMappingURL=session-row-dot.js.map
    },
    };
    var __cache = {};
    function __req(key) {
      if (__cache[key]) return __cache[key].exports;
      var m = { exports: {} };
      __cache[key] = m;
      __mods[key](__req, m, m.exports);
      return m.exports;
    }
    return __req("client/dsh-plugin.js");
  }
});
