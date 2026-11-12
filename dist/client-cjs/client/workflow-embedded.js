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
const verify_checks_1 = require("../schema/verify-checks");
const workflow_dialogs_1 = require("./workflow-dialogs");
const menu_anchor_1 = require("./menu-anchor");
const node_state_color_1 = require("./node-state-color");
const session_state_store_1 = require("./session-state-store");
const workflow_stream_1 = require("./workflow-stream");
const client_log_1 = require("./client-log");
const dsh_client_ui_primitives_1 = require("@deepseek-ai/dsh-client-ui-primitives");
/** 四态单向推进表。 */
const NEXT_NODE_STATE = {
    discussing: 'implementing',
    implementing: 'verifying',
    verifying: 'completed',
    completed: null,
};
/**
 * 空会话（还没对话过）的轮询间隔。
 *
 * 为什么只对空会话轮询：新建会话可以在任何时候被切成「工作流模式」，而这次切换
 * 宿主不会发任何事件——只有主动问才能知道。会话一旦聊过，就完全交给 SSE 推送，
 * 恢复零轮询；这样「每个会话每 3 秒问一次」不会回来。
 */
const EMPTY_SESSION_POLL_INTERVAL_MS = 3_000;
/** 返工（后退）转移表：当前态 → 可退回的态。已完结允许退回验收中或讨论中。 */
const BACKWARD_STATES = {
    implementing: ['discussing'],
    verifying: ['implementing', 'discussing'],
    completed: ['verifying', 'discussing'],
};
function WorkflowStateBadge(props) {
    const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
    const [nodeInfo, setNodeInfo] = (0, react_1.useState)(null);
    const [advancing, setAdvancing] = (0, react_1.useState)(false);
    const [checklist, setChecklist] = (0, react_1.useState)([]);
    const [verification, setVerification] = (0, react_1.useState)([]);
    const [hasPlan, setHasPlan] = (0, react_1.useState)(true);
    const [checklistMenu, setChecklistMenu] = (0, react_1.useState)(null);
    const [backwardMenu, setBackwardMenu] = (0, react_1.useState)(null);
    const [detailOpen, setDetailOpen] = (0, react_1.useState)(false);
    const [settingsOpen, setSettingsOpen] = (0, react_1.useState)(false);
    const [returnToDetail, setReturnToDetail] = (0, react_1.useState)(false);
    const [confirmOpen, setConfirmOpen] = (0, react_1.useState)(false);
    /** 这个会话有没有对话过：没有就轮询（预设随时可能被切过来），有就完全靠推送。 */
    const hasMessagesRef = (0, react_1.useRef)(false);
    /** 上一次上报给宿主的节点 id：只上报「拿到/丢掉节点」这两个跳，不逐帧刷。 */
    const reportedNodeRef = (0, react_1.useRef)('');
    /**
     * 浏览器侧埋点：把「拿到节点 / 节点消失」这条跳发回宿主。
     *
     * 宿主日志能证明「服务端给了节点」，证明不了「页面拿到之后有没有画出来」；
     * 这次排查就卡在这一点上，所以这里只在变化时补一条。
     */
    const reportNodeChange = (info) => {
        const nextId = info === null ? '' : info.nodeId;
        if (nextId === reportedNodeRef.current)
            return;
        reportedNodeRef.current = nextId;
        void (0, client_log_1.reportClientEvent)('info', info === null ? `badge cleared (session=${sessionId})` : `badge node (session=${sessionId}, node=${info.nodeId}, state=${info.state})`);
    };
    /** 防止一轮还没回来又叠一轮（3 秒定时器 + 推送事件可能撞在一起）。 */
    const inFlightRef = (0, react_1.useRef)(false);
    // 自动认领需要会话的工作目录：useSessions 是带选择器的钩子，直接取当前会话的 cwd。
    const sessionCwd = typeof props?.useSessions === 'function'
        ? props.useSessions((s) => (s?.byId?.[sessionId]?.cwd ?? ''))
        : '';
    /** 通知侧栏状态点：只带本次变化的会话，别再让每个点各自重取整表。 */
    const notifyStateChanged = (state) => {
        window.dispatchEvent(new CustomEvent(session_state_store_1.WORKFLOW_STATE_CHANGED_EVENT, { detail: { sessionId, state } }));
    };
    const ensureNode = async (workingDirectory) => {
        try {
            const response = await fetch('/dsh-agent-workflow/ensure-node', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ sessionId, workingDirectory }),
            });
            const responseBody = await response.json().catch(() => null);
            const node = responseBody?.ok === true ? responseBody.node : null;
            const state = typeof node?.current_state === 'string' ? node.current_state : '';
            return state === '' ? null : state;
        }
        catch {
            return null;
        }
    };
    const readChecklist = async (workflowId, nodeId) => {
        try {
            const response = await fetch(`/dsh-agent-workflow/node-checklist?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
            const responseBody = await response.json().catch(() => null);
            if (responseBody?.ok === true) {
                const items = Array.isArray(responseBody.checklist) ? responseBody.checklist : [];
                const plan = responseBody.hasPlan !== false;
                const verifyItems = Array.isArray(responseBody.verification) ? responseBody.verification : [];
                setChecklist(items);
                setHasPlan(plan);
                setVerification(verifyItems);
                return { checklist: items, hasPlan: plan };
            }
        }
        catch (error) {
            // 埋点：读失败会降级成「不拦、交给服务端」，必须留痕，否则分不清「放行」和「没读到」。
            console.warn('[dsh-agent-workflow] 读清单失败，降级为交给服务端校验：', error);
            setChecklist([]);
            setVerification([]);
        }
        return { checklist: [], hasPlan: true };
    };
    const readNode = async () => {
        try {
            const response = await fetch(`/dsh-agent-workflow/node-by-session?sessionId=${encodeURIComponent(sessionId)}`);
            const responseBody = await response.json().catch(() => null);
            // 宿主顺带告诉「这个会话有没有对话过」：空会话要轮询，聊过的靠推送。
            hasMessagesRef.current = responseBody?.hasMessages === true;
            const node = responseBody?.ok === true ? responseBody.node : null;
            if (node === null || node === undefined) {
                reportNodeChange(null);
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
            reportNodeChange(info);
            setNodeInfo(info);
            return info;
        }
        catch {
            // 读失败也按「这一刻没有节点」上报：否则界面上「没有胶囊」分不清是没数据还是请求失败。
            reportNodeChange(null);
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
            if (cancelled || inFlightRef.current)
                return;
            inFlightRef.current = true;
            try {
                let info = await readNode();
                // 自动认领只对「还没聊过」的会话做：新会话可能刚被切成工作流，而宿主不会为
                // 这次切换发任何事件；聊过的会话迟早会走到 agent/pre-step，由宿主自己认领。
                if (info === null && !hasMessagesRef.current) {
                    const ensuredState = await ensureNode(sessionCwd);
                    if (ensuredState !== null) {
                        // 新建的会话也要立刻有圆点，不用等下一次整表刷新。
                        notifyStateChanged(ensuredState);
                        info = await readNode();
                    }
                }
                if (info !== null && (info.state === 'implementing' || info.state === 'verifying')) {
                    void readChecklist(info.workflowId, info.nodeId);
                }
                else {
                    setChecklist([]);
                    setVerification([]);
                }
            }
            finally {
                inFlightRef.current = false;
            }
        };
        void tick();
        // 宿主会把「这个会话变了」（状态切换 / 节点补建 / 预设释放 / 待确认推进）推过来，
        // 收到就重取一次。
        const stream = (0, workflow_stream_1.workflowStream)();
        const unsubscribe = stream.subscribe((event) => {
            if (event.sessionId !== sessionId)
                return;
            if (event.state !== null)
                notifyStateChanged(event.state);
            void tick();
        });
        // 轮询只服务「还没对话过」的会话（新建 = 空会话，数量小、生命周期短）；
        // 一旦聊过，就完全交给推送，恢复零轮询。
        const timer = window.setInterval(() => {
            if (!hasMessagesRef.current)
                void tick();
        }, EMPTY_SESSION_POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            unsubscribe();
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
            // 通知侧栏会话行的状态点刷新：只更新这一个会话。
            notifyStateChanged(to);
            const info = await readNode();
            if (info !== null)
                await applyEnterTrigger(info.enterTrigger);
            if (info !== null && (info.state === 'implementing' || info.state === 'verifying')) {
                void readChecklist(info.workflowId, info.nodeId);
            }
            else {
                setChecklist([]);
                setVerification([]);
            }
            console.info(`[dsh-agent-workflow] 推进成功 (to=${to}, ${Date.now() - startedAt}ms)`);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 推进状态失败：', error);
        }
        finally {
            setAdvancing(false);
        }
    };
    /**
     * 推进：进入实现中前若方案没写，只弹说明、不发请求。
     *
     * 「方案非空」是服务端的硬前置，`/transition` 一定会拒绝；这里如果还发请求，
     * 用户会看到一个「仍进入」按钮点完必失败——所以这里根本不再调 `transitionTo`。
     */
    const advance = async () => {
        if (nextState === null || advancing)
            return;
        if (nextState === 'implementing') {
            // readChecklist 内部吞异常并返回 hasPlan=true：读不到就不拦，交给服务端前置校验裁决。
            const meta = await readChecklist(nodeInfo.workflowId, nodeInfo.nodeId);
            if (!meta.hasPlan) {
                // 埋点：本地拦下要留痕，否则日志里只有「点了没反应」，排查时这一跳答不上来。
                console.info(`[dsh-agent-workflow] 推进被本地方案校验拦下 (node=${nodeInfo.nodeId}, to=${nextState})`);
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
            const info = await readNode();
            if (info !== null) {
                // 同意 / 拒绝之后都可能改变节点状态：按服务端读回的状态更新这一行。
                notifyStateChanged(info.state);
                if (accept)
                    await applyEnterTrigger(info.enterTrigger);
                if (info.state === 'implementing' || info.state === 'verifying') {
                    void readChecklist(info.workflowId, info.nodeId);
                }
                else {
                    setChecklist([]);
                    setVerification([]);
                }
            }
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 处理推进请求失败：', error);
        }
    };
    const doneCount = checklist.filter((item) => item.done).length;
    const verifyPassCount = verification.filter((item) => item.mark === 'pass').length;
    const verifyDeferredCount = verification.filter((item) => item.mark === 'deferred').length;
    const verifyDoneCount = verifyPassCount + verifyDeferredCount;
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
                                }, onMouseEnter: (event) => { event.currentTarget.style.borderColor = 'var(--dsw-alias-border-l1)'; }, onMouseLeave: (event) => { event.currentTarget.style.borderColor = 'transparent'; }, children: ["\u5B9E\u65BD ", doneCount, "/", checklist.length] }), checklistMenu !== null ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, align: "end", getAnchorRect: () => (0, menu_anchor_1.menuAnchorRect)(checklistMenu), items: checklist.map((item) => ({ id: item.label, label: `${item.done ? '✓' : '○'}  ${item.label}` })), onClose: () => setChecklistMenu(null), onSelect: () => setChecklistMenu(null) })) : null] })) : null, nodeInfo.state === 'verifying' && verification.length > 0 ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", title: "\u9A8C\u6536\u8FDB\u5EA6\uFF08AI \u62A5\u5907\u540E\u81EA\u52A8\u6807\u8BB0\uFF0C\u53EA\u8BFB\uFF09", onClick: (event) => {
                                    event.currentTarget.focus({ preventScroll: true });
                                    const point = (0, menu_anchor_1.menuPointFromEvent)(event);
                                    setChecklistMenu((current) => (current === null ? point : null));
                                }, style: {
                                    display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px',
                                    borderRadius: 6, border: '1px solid transparent', background: 'var(--dsw-alias-bg-layer-1)',
                                    color: verifyDoneCount === verification.length ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary))',
                                    fontSize: 11, lineHeight: '22px', whiteSpace: 'nowrap', cursor: 'pointer',
                                }, onMouseEnter: (event) => { event.currentTarget.style.borderColor = 'var(--dsw-alias-border-l1)'; }, onMouseLeave: (event) => { event.currentTarget.style.borderColor = 'transparent'; }, children: ["\u9A8C\u6536 ", verifyPassCount, "/", verification.length, verifyDeferredCount > 0 ? `（${verifyDeferredCount} 问询）` : ''] }), checklistMenu !== null ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, align: "end", getAnchorRect: () => (0, menu_anchor_1.menuAnchorRect)(checklistMenu), items: verification.map((item) => ({ id: String(item.id), label: `${(0, verify_checks_1.verifyMarkSymbol)(item.mark)}  ${item.id} ${item.name}` })), onClose: () => setChecklistMenu(null), onSelect: () => setChecklistMenu(null) })) : null] })) : null, backwardStates.length > 0 ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u8FD4\u5DE5\uFF08\u9000\u56DE\u4E0A\u4E00\u9636\u6BB5\uFF09", side: "top", delayMs: 400, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": "\u8FD4\u5DE5", disabled: advancing, onClick: (event) => {
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
                        } })) : null, confirmOpen ? ((0, jsx_runtime_1.jsx)(workflow_dialogs_1.WorkflowConfirmDialog, { title: "\u8FD8\u4E0D\u80FD\u8FDB\u5165\u300C\u5B9E\u73B0\u4E2D\u300D", message: '这个节点的会话手册里「方案」还是空的。\n\n「方案非空」是推进到实现中的硬条件，服务端会直接拒绝，所以这里只做提示、不会强行进入。\n\n先把方案写进手册：让 AI 用 workflow_manual 写，或直接编辑 .workflow/会话手册-' + nodeInfo.nodeId + '.md 的「方案」小节。', confirmLabel: "\u77E5\u9053\u4E86", onClose: () => setConfirmOpen(false), onConfirm: () => setConfirmOpen(false) })) : null] }), document.body)] }));
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