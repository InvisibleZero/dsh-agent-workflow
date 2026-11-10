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
const node_state_label_1 = require("../schema/node-state-label");
const workflow_dialogs_1 = require("./workflow-dialogs");
const menu_anchor_1 = require("./menu-anchor");
const node_state_color_1 = require("./node-state-color");
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