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
    const verify_checks_1 = __req("schema/verify-checks.js");
    const workflow_dialogs_1 = __req("client/workflow-dialogs.js");
    const menu_anchor_1 = __req("client/menu-anchor.js");
    const node_state_color_1 = __req("client/node-state-color.js");
    const session_state_store_1 = __req("client/session-state-store.js");
    const workflow_stream_1 = __req("client/workflow-stream.js");
    const client_log_1 = __req("client/client-log.js");
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
    "schema/verify-checks.js": function(__req, module, exports) {
    "use strict";
    /**
     * 验收七项：固定条目（对应全局「七项体检」）。
     *
     * 只放常量与类型，**不引 zod**：客户端徽标要读条目名，客户端包里不能出现 zod
     * （client-bundle-purity 会拦）。
     *
     * 七项的顺序与名称是协议的一部分：报备按 id 落标记，不按文本匹配——
     * 文本是人写的，改一个字就再也勾不上（和手册「实施顺序」按文本匹配相反）。
     */
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.VERIFY_CHECKS = void 0;
    exports.verifyMarkSymbol = verifyMarkSymbol;
    exports.createVerification = createVerification;
    exports.VERIFY_CHECKS = [
        { id: 1, name: '契约测试', needs_command: true, judge: '对外行为与原实现一致或按新契约验证，要有可复现对照' },
        { id: 2, name: '依赖检查', needs_command: false, judge: '无反向依赖、无循环依赖、无跨层引用' },
        { id: 3, name: '死代码扫描', needs_command: false, judge: '无用导出 / 参数 / 字段，且要证明确实可删（引用计数为零）' },
        { id: 4, name: '边界测试', needs_command: true, judge: '外部依赖可 mock，模块能独立测试' },
        { id: 5, name: '命名与边界审查', needs_command: false, judge: '泛化词、跨模块暴露、反向冗长、前缀越界四项' },
        { id: 6, name: '埋点检测', needs_command: false, judge: '黑盒逐跳三问 + 白盒五字段，三类结论：断点 / 无效埋点 / 质量盲区' },
        { id: 7, name: '回归与压测', needs_command: true, judge: '跑现有测试套件，给 pass / fail + 证据（耗时、错误率、埋点抽样）' },
    ];
    /** 标记的显示符号：徽标、菜单、注入文本共用一套，避免三处各写一份。 */
    function verifyMarkSymbol(mark) {
        if (mark === 'pass')
            return '✓';
        if (mark === 'deferred')
            return '？';
        return '○';
    }
    /** 按当前轮次造一份全空清单（七项固定顺序）。 */
    function createVerification(round) {
        return {
            round,
            items: exports.VERIFY_CHECKS.map((check) => ({ id: check.id, mark: 'pending', report: null })),
        };
    }
    //# sourceMappingURL=verify-checks.js.map
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
    const manual_limits_1 = __req("schema/manual-limits.js");
    const node_state_color_1 = __req("client/node-state-color.js");
    const client_log_1 = __req("client/client-log.js");
    const LABEL_STYLE = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4, display: 'block' };
    /**
     * 「切换状态时自动发送默认输入」勾选框是否显示。
     * 交互还没定清楚（自动发送会对输入框现有内容动手），先屏蔽 UI；后端接口与自动发送逻辑保留，
     * 想恢复把这里改成 true 即可。
     */
    const AUTO_SEND_SETTING_VISIBLE = false;
    /** 随插件提供的内置存档名：只读，不可改不可删。 */
    const BUILTIN_PROFILE_NAME = '默认存档';
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
    /** 设置页页签行右侧的只读「附表」：故意不放进 STATE_TABS——那圈代码按状态 id 读写 detail，附表没有可编辑字段。 */
    const APPENDIX_TAB = { id: 'appendix', label: '附表' };
    /**
     * 附表：设置页里的只读清单。
     *
     * 内容不在客户端写死——点开页签（组件挂载）时才去 /appendix 现取；
     * 读失败给错误 + 重试，绝不用空清单冒充「五项是空的」。
     */
    function AppendixPanel() {
        const [attempt, setAttempt] = (0, react_1.useState)(0);
        const [status, setStatus] = (0, react_1.useState)('loading');
        const [planSections, setPlanSections] = (0, react_1.useState)([]);
        const [planFallback, setPlanFallback] = (0, react_1.useState)('');
        const [verifyItems, setVerifyItems] = (0, react_1.useState)([]);
        const [error, setError] = (0, react_1.useState)('');
        (0, react_1.useEffect)(() => {
            let cancelled = false;
            setStatus('loading');
            setError('');
            void (async () => {
                try {
                    const response = await fetch('/dsh-agent-workflow/appendix');
                    const body = await response.json().catch(() => null);
                    if (cancelled)
                        return;
                    if (body?.ok !== true) {
                        const message = String(body?.error ?? '读取附表失败');
                        setStatus('error');
                        setError(message);
                        void (0, client_log_1.reportClientEvent)('warn', `[appendix] 读取失败（路由）：${message}`);
                        return;
                    }
                    setPlanSections(Array.isArray(body.planSections) ? body.planSections : []);
                    setPlanFallback(typeof body.planFallback === 'string' ? body.planFallback : '');
                    setVerifyItems(Array.isArray(body.verifyItems) ? body.verifyItems : []);
                    setStatus('ready');
                    // 成功也要留一跳：服务端只证明「返回了」，这条才证明「页面拿到了」。
                    void (0, client_log_1.reportClientEvent)('info', `[appendix] 已取回 方案 ${Array.isArray(body.planSections) ? body.planSections.length : 0} 条 / 验收 ${Array.isArray(body.verifyItems) ? body.verifyItems.length : 0} 条`);
                }
                catch (reason) {
                    if (!cancelled) {
                        setStatus('error');
                        setError(String(reason));
                        void (0, client_log_1.reportClientEvent)('warn', `[appendix] 读取失败（异常）：${String(reason)}`);
                    }
                }
            })();
            return () => { cancelled = true; };
        }, [attempt]);
        if (status === 'loading') {
            return (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: "\u8BFB\u53D6\u4E2D\u2026" });
        }
        if (status === 'error') {
            return ((0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 }, children: ["\u8BFB\u4E0D\u5230\u9644\u8868\uFF1A", error] }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setAttempt((value) => value + 1), style: {
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--dsw-alias-border-l1)',
                            background: 'transparent',
                            color: 'var(--dsw-alias-label-primary)',
                            cursor: 'pointer',
                            fontSize: 12,
                        }, children: "\u91CD\u8BD5" })] }));
        }
        return ((0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: 16, alignItems: 'flex-start', overflow: 'auto', minHeight: 0 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { flex: '1 1 0', minWidth: 0 }, children: [(0, jsx_runtime_1.jsx)("div", { style: LABEL_STYLE, children: "\u5B9E\u73B0\u4E2D \u00B7 \u4E94\u9879\uFF08\u65B9\u6848\u4E94\u5C0F\u8282\uFF0C\u89E3\u6790\u81EA\u4F1A\u8BDD\u624B\u518C\u6A21\u677F\uFF09" }), planSections.length > 0 ? planSections.map((section) => ((0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: 8 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 12, fontWeight: 600 }, children: [section.id, ". ", section.title] }), section.hint !== '' ? ((0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5 }, children: section.hint })) : null] }, section.id))) : ((0, jsx_runtime_1.jsx)("pre", { style: { whiteSpace: 'pre-wrap', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', margin: 0, lineHeight: 1.5 }, children: planFallback }))] }), (0, jsx_runtime_1.jsxs)("div", { style: { flex: '1 1 0', minWidth: 0 }, children: [(0, jsx_runtime_1.jsx)("div", { style: LABEL_STYLE, children: "\u9A8C\u6536\u4E2D \u00B7 \u4E03\u9879\uFF08\u4E03\u9879\u9A8C\u6536\u9879\uFF09" }), verifyItems.map((item) => ((0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: 8 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 12, fontWeight: 600 }, children: [item.id, ". ", item.name, item.needsCommand ? ((0, jsx_runtime_1.jsx)("span", { style: { marginLeft: 6, fontSize: 11, color: 'var(--dsw-alias-brand-primary)' }, children: "\u5FC5\u987B\u5E26\u590D\u8DD1\u547D\u4EE4" })) : null] }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5 }, children: item.judge })] }, item.id)))] })] }));
    }
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
            }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, children: [(0, jsx_runtime_1.jsxs)("span", { style: { fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: ["\u672C\u9636\u6BB5\u786C\u89C4\u5219\uFF08\u63D2\u4EF6\u5C42\uFF0C\u53EA\u8BFB\uFF09\u00B7 ", label] }), (0, jsx_runtime_1.jsxs)("span", { style: { display: 'flex', gap: 10, flexShrink: 0 }, children: [props.overridden && props.readOnly !== true ? ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: props.onReset, style: { border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', textDecoration: 'underline' }, children: "\u6062\u590D\u9ED8\u8BA4" })) : null, (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setExpanded((value) => !value), style: { border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', textDecoration: 'underline' }, children: showBody ? '收起' : '展开' }), props.readOnly === true ? null : ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => { setUnlocked((value) => !value); setExpanded(true); }, style: { border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 11.5, color: 'var(--dsw-alias-brand-primary)', textDecoration: 'underline' }, children: unlocked ? '完成改写' : '改写硬规则' }))] })] }), showBody ? ((0, jsx_runtime_1.jsx)("div", { style: { marginTop: 5 }, children: unlocked ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11.5, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5, marginBottom: 4 }, children: "\u26A0 \u786C\u89C4\u5219\u7528\u4E8E\u9636\u6BB5\u63A8\u8FDB\u6821\u9A8C\uFF08\u65B9\u6848\u662F\u5426\u5199\u8FDB\u624B\u518C\u3001\u6E05\u5355\u662F\u5426\u5168\u52FE\uFF09\u3002\u6539\u4E86\u53EF\u80FD\u5BFC\u81F4\u6821\u9A8C\u4E0E\u4F60\u7684\u9884\u671F\u4E0D\u7B26\uFF0C\u786E\u8BA4\u540E\u518D\u6539\u3002" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, minHeight: 80 }, value: props.value, onChange: (event) => props.onChange(event.target.value) })] })) : ((0, jsx_runtime_1.jsx)("div", { style: { whiteSpace: 'pre-wrap', fontSize: 11.5, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)', maxHeight: 96, overflow: 'auto' }, children: props.value })) })) : null] }));
    }
    /** 设置页顶部那排小按钮：统一尺寸，避免每处手写 style。 */
    function ProfileToolButton(props) {
        return ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: props.onClick, disabled: props.disabled === true, style: {
                height: 26,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid var(--dsw-alias-border-l1)',
                background: 'var(--dsw-alias-bg-base)',
                color: props.disabled === true ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-label-primary)',
                fontSize: 12,
                cursor: props.disabled === true ? 'default' : 'pointer',
                opacity: props.disabled === true ? 0.6 : 1,
            }, children: props.children }));
    }
    function WorkflowGlobalSettingsSection() {
        const [detail, setDetail] = (0, react_1.useState)(null);
        const [defaults, setDefaults] = (0, react_1.useState)(null);
        const [autoSend, setAutoSend] = (0, react_1.useState)(false);
        /** 手册字数上限（字符数）：应用级，写进 app-settings.json，写手册时按它拒写。 */
        const [limits, setLimits] = (0, react_1.useState)({ ...manual_limits_1.DEFAULT_MANUAL_LIMITS });
        const [activeTab, setActiveTab] = (0, react_1.useState)('shared');
        const [status, setStatus] = (0, react_1.useState)('idle');
        const [error, setError] = (0, react_1.useState)(null);
        const [profiles, setProfiles] = (0, react_1.useState)([BUILTIN_PROFILE_NAME]);
        const [activeProfile, setActiveProfile] = (0, react_1.useState)(BUILTIN_PROFILE_NAME);
        const [importOpen, setImportOpen] = (0, react_1.useState)(false);
        const [importText, setImportText] = (0, react_1.useState)('');
        const [importName, setImportName] = (0, react_1.useState)('');
        const [saveAsOpen, setSaveAsOpen] = (0, react_1.useState)(false);
        const [saveAsName, setSaveAsName] = (0, react_1.useState)('');
        const importFileRef = (0, react_1.useRef)(null);
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
                        setProfiles(Array.isArray(responseBody.profiles) && responseBody.profiles.length > 0
                            ? responseBody.profiles
                            : [BUILTIN_PROFILE_NAME]);
                        setActiveProfile(String(responseBody.activeProfile ?? BUILTIN_PROFILE_NAME));
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
        /** 存档相关的写操作统一走这里：成功就刷新列表与内容。 */
        const callProfileRoute = async (route, payload) => {
            try {
                const response = await fetch(`/dsh-agent-workflow/${route}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const body = await response.json().catch(() => null);
                if (body?.ok !== true) {
                    window.alert(String(body?.error ?? '操作失败'));
                    return false;
                }
                const list = Array.isArray(body.profiles) ? body.profiles : (Array.isArray(body.names) ? body.names : null);
                if (list !== null && list.length > 0)
                    setProfiles(list);
                if (typeof body.activeProfile === 'string')
                    setActiveProfile(body.activeProfile);
                else if (typeof body.active === 'string')
                    setActiveProfile(body.active);
                if (body.globalOperationDetail !== undefined)
                    setDetail(body.globalOperationDetail);
                return true;
            }
            catch (reason) {
                window.alert(String(reason));
                return false;
            }
        };
        // 应用级开关：切换状态时是否自动发送默认输入（默认关闭）。
        (0, react_1.useEffect)(() => {
            let cancelled = false;
            void (async () => {
                try {
                    const response = await fetch('/dsh-agent-workflow/app-settings');
                    const responseBody = await response.json().catch(() => null);
                    if (!cancelled && responseBody?.ok === true) {
                        setAutoSend(responseBody.autoSendEnterTrigger === true);
                        if (responseBody.manualLimits !== undefined && responseBody.manualLimits !== null) {
                            setLimits({ ...manual_limits_1.DEFAULT_MANUAL_LIMITS, ...responseBody.manualLimits });
                        }
                    }
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
        /** 手册字数上限：失焦即存；越界值由后端收成合法区间，这里只做输入框约束。 */
        const saveLimit = async (field, raw) => {
            const parsed = Number(raw);
            const value = Number.isFinite(parsed) ? Math.round(parsed) : manual_limits_1.DEFAULT_MANUAL_LIMITS[field];
            const next = { ...limits, [field]: value };
            setLimits(next);
            try {
                const response = await fetch('/dsh-agent-workflow/app-settings-save', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ manualLimits: next }),
                });
                const body = await response.json().catch(() => null);
                if (body?.ok === true && body.manualLimits !== undefined)
                    setLimits({ ...manual_limits_1.DEFAULT_MANUAL_LIMITS, ...body.manualLimits });
                else if (body?.ok !== true)
                    window.alert(String(body?.error ?? '保存手册上限失败'));
            }
            catch (reason) {
                window.alert(String(reason));
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
        const readOnlyProfile = activeProfile === BUILTIN_PROFILE_NAME;
        const switchProfile = async (name) => {
            if (name === activeProfile)
                return;
            await callProfileRoute('profiles-activate', { name });
        };
        /** 另存为：用面板里的输入框取名（Electron 里 window.prompt 不可用）。 */
        const saveAsProfile = async () => {
            const name = saveAsName.trim();
            if (name === '') {
                window.alert('先填一个存档名');
                return;
            }
            if (await callProfileRoute('profiles-save', { name })) {
                setSaveAsOpen(false);
                setSaveAsName('');
            }
        };
        const removeProfile = async () => {
            if (readOnlyProfile)
                return;
            if (!window.confirm(`删除存档「${activeProfile}」？删掉后会回到「${BUILTIN_PROFILE_NAME}」。`))
                return;
            await callProfileRoute('profiles-delete', { name: activeProfile });
        };
        const exportProfile = async () => {
            if (await callProfileRoute('profiles-export', {}))
                window.alert('已备份到 exports/backup/，并已在资源管理器里打开。');
        };
        /** 重新扫一遍存档目录：手动往文件夹里丢 json 之后点它。 */
        const refreshProfiles = async () => {
            try {
                const response = await fetch('/dsh-agent-workflow/global-settings');
                const body = await response.json().catch(() => null);
                if (body?.ok !== true) {
                    window.alert(String(body?.error ?? '刷新失败'));
                    return;
                }
                if (Array.isArray(body.profiles) && body.profiles.length > 0)
                    setProfiles(body.profiles);
                if (typeof body.activeProfile === 'string')
                    setActiveProfile(body.activeProfile);
                if (body.globalOperationDetail !== undefined)
                    setDetail(body.globalOperationDetail);
            }
            catch (reason) {
                window.alert(String(reason));
            }
        };
        /** 选一个 json 文件导入成存档：文件名即存档名。 */
        const pickImportFile = async (event) => {
            const file = event?.target?.files?.[0];
            if (event?.target)
                event.target.value = ''; // 允许再次选同一个文件
            if (file === undefined)
                return;
            try {
                const text = await file.text();
                const name = file.name.replace(/\.json$/i, '');
                if (await callProfileRoute('profiles-import', { name, json: text })) {
                    window.alert(`已导入「${name}」，可在下拉里选它。`);
                }
            }
            catch (reason) {
                window.alert(String(reason));
            }
        };
        /** 改动即排一次防抖保存（700ms），不需要「保存」按钮。 */
        const update = (next) => {
            if (readOnlyProfile)
                return; // 内置存档只读：要改先另存为
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
        return ((0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginBottom: 12 }, children: "\u8FD9\u4E9B\u64CD\u4F5C\u7EC6\u8282\u662F\u5E94\u7528\u7EA7\u5168\u5C40\u7684\uFF0C\u6240\u6709 workflow \u8282\u70B9\u5728\u5BF9\u5E94\u72B6\u6001\u4E0B\u90FD\u4F1A\u8BFB\u5230\uFF1B\u8282\u70B9\u53EF\u4EE5\u5355\u72EC\u8986\u76D6\u81EA\u5DF1\u5F53\u524D\u72B6\u6001\u90A3\u4E00\u6761\u3002" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: "\u5B58\u6863" }), (0, jsx_runtime_1.jsx)("select", { value: activeProfile, onChange: (event) => { void switchProfile(event.target.value); }, style: {
                                height: 26,
                                borderRadius: 6,
                                border: '1px solid var(--dsw-alias-border-l1)',
                                background: 'var(--dsw-alias-bg-base)',
                                color: 'var(--dsw-alias-label-primary)',
                                fontSize: 12,
                                padding: '0 6px',
                            }, children: profiles.map((name) => (0, jsx_runtime_1.jsx)("option", { value: name, children: name }, name)) }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { setSaveAsOpen((value) => !value); setSaveAsName((current) => (current !== '' ? current : (readOnlyProfile ? '我的存档' : `${activeProfile} 副本`))); }, children: "\u53E6\u5B58\u4E3A" }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { void removeProfile(); }, disabled: readOnlyProfile, children: "\u5220\u9664" }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { void refreshProfiles(); }, children: "\u5237\u65B0" }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { void exportProfile(); }, children: "\u5907\u4EFD" }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { importFileRef.current?.click(); }, children: "\u5BFC\u5165" }), readOnlyProfile ? ((0, jsx_runtime_1.jsxs)("span", { style: { fontSize: 11.5, color: 'var(--dsw-alias-state-warn-primary)' }, children: ["\u300C", BUILTIN_PROFILE_NAME, "\u300D\u968F\u63D2\u4EF6\u63D0\u4F9B\u3001\u4E0D\u53EF\u4FEE\u6539\uFF1B\u8981\u6539\u5148\u300C\u53E6\u5B58\u4E3A\u300D"] })) : null] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 10,
                        marginBottom: 12,
                        fontSize: 12,
                        color: 'var(--dsw-alias-label-secondary)',
                    }, children: [(0, jsx_runtime_1.jsx)("span", { children: "\u624B\u518C\u5B57\u6570\u4E0A\u9650" }), [
                            { field: 'constraints_chars', label: '约束 / 红线' },
                            { field: 'plan_chars', label: '方案' },
                            { field: 'session_total_chars', label: '会话手册整本' },
                        ].map((item) => ((0, jsx_runtime_1.jsxs)("label", { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [(0, jsx_runtime_1.jsx)("span", { children: item.label }), (0, jsx_runtime_1.jsx)("input", { type: "number", min: manual_limits_1.MANUAL_LIMIT_MIN_CHARS, max: manual_limits_1.MANUAL_LIMIT_MAX_CHARS, value: limits[item.field], onChange: (event) => setLimits({ ...limits, [item.field]: Number(event.target.value) }), onBlur: (event) => { void saveLimit(item.field, event.target.value); }, style: {
                                        width: 72,
                                        height: 24,
                                        borderRadius: 6,
                                        border: '1px solid var(--dsw-alias-border-l1)',
                                        background: 'var(--dsw-alias-bg-base)',
                                        color: 'var(--dsw-alias-label-primary)',
                                        fontSize: 12,
                                        padding: '0 6px',
                                    } })] }, item.field))), (0, jsx_runtime_1.jsx)("span", { style: { fontSize: 11 }, children: "\u5B57\uFF08\u6309\u5B57\u4E0D\u6309\u5B57\u8282\uFF1B\u52FE\u9009\u8BC1\u636E\u4E0D\u8BA1\u5165\uFF09" })] }), saveAsOpen ? ((0, jsx_runtime_1.jsxs)("div", { style: {
                        border: '1px solid var(--dsw-alias-border-l1)',
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 10,
                        background: 'var(--dsw-alias-bg-base)',
                    }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', marginBottom: 6 }, children: "\u590D\u5236\u5F53\u524D\u8FD9\u4EFD A/B/C/D \u6210\u4E00\u4EFD\u65B0\u5B58\u6863\uFF08\u6587\u4EF6\u540D\u5373\u5B58\u6863\u540D\uFF09\u3002" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: 8 }, children: [(0, jsx_runtime_1.jsx)("input", { value: saveAsName, onChange: (event) => setSaveAsName(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter')
                                        void saveAsProfile(); }, placeholder: "\u5B58\u6863\u540D", autoFocus: true, style: {
                                        flex: '1 1 auto',
                                        height: 26,
                                        borderRadius: 6,
                                        border: '1px solid var(--dsw-alias-border-l1)',
                                        background: 'var(--dsw-alias-bg-layer-1)',
                                        color: 'var(--dsw-alias-label-primary)',
                                        fontSize: 12,
                                        padding: '0 8px',
                                    } }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { void saveAsProfile(); }, children: "\u4FDD\u5B58" }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { setSaveAsOpen(false); setSaveAsName(''); }, children: "\u53D6\u6D88" })] })] })) : null, (0, jsx_runtime_1.jsx)("input", { ref: importFileRef, type: "file", accept: ".json,application/json", style: { display: 'none' }, onChange: (event) => { void pickImportFile(event); } }), AUTO_SEND_SETTING_VISIBLE ? ((0, jsx_runtime_1.jsxs)("label", { style: {
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
                                        } }), (0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'nowrap' }, children: item.label }), index < node_state_color_1.WORKFLOW_FLOW.length - 1 ? ((0, jsx_runtime_1.jsx)("span", { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginLeft: 2 }, children: "\u2192" })) : null] }, item.state))) }), (0, jsx_runtime_1.jsx)("div", { style: { marginTop: 6, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }, children: "\u8FD4\u5DE5\uFF08\u9000\u56DE\u4E0A\u4E00\u9636\u6BB5\uFF09\uFF1A\u5B9E\u73B0\u4E2D \u2192 \u8BA8\u8BBA\u4E2D\uFF1B\u9A8C\u6536\u4E2D \u2192 \u5B9E\u73B0\u4E2D / \u8BA8\u8BBA\u4E2D" })] }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', gap: 4, borderBottom: '1px solid var(--dsw-alias-border-l1)', marginBottom: 12 }, children: [...STATE_TABS, APPENDIX_TAB].map((tab) => ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setActiveTab(tab.id), style: {
                            padding: '6px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid var(--dsw-alias-brand-primary)' : '2px solid transparent',
                            color: activeTab === tab.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                            cursor: 'pointer',
                            fontSize: 12,
                        }, children: tab.label }, tab.id))) }), (0, jsx_runtime_1.jsx)("div", { style: {
                        display: 'flex',
                        flexDirection: 'column',
                        height: 380,
                        // 内置存档只读：输入框用 readOnly（仍能滚动、选中、复制），
                        // 不能用 pointer-events:none 整块禁用——那样滚轮和文本选择都会一起失效。
                    }, children: activeTab === 'appendix' ? ((0, jsx_runtime_1.jsx)(AppendixPanel, {})) : activeTab === 'shared' ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u516C\u5171\u64CD\u4F5C\u7EC6\u8282 \u00B7 \u4E09\u6001\u901A\u7528" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '1 1 auto' }, readOnly: readOnlyProfile, value: detail.shared_detail ?? '', onChange: (event) => update({ ...detail, shared_detail: event.target.value }) })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u8FDB\u5165\u8BE5\u72B6\u6001\u540E\u81EA\u52A8\u704C\u5165\u8F93\u5165\u6846\u7684\u9ED8\u8BA4\u6587\u672C\uFF08\u53EF\u7A7A\uFF09" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '0 0 20%', resize: 'none' }, readOnly: readOnlyProfile, value: detail[activeTab]?.enter_trigger ?? '', placeholder: "\u7559\u7A7A\u5219\u4E0D\u81EA\u52A8\u704C\u5165", onChange: (event) => patchTab(activeTab, { enter_trigger: event.target.value === '' ? null : event.target.value }) }), (0, jsx_runtime_1.jsx)("label", { style: { ...LABEL_STYLE, marginTop: 10 }, children: "\u8BE5\u72B6\u6001\u7684\u64CD\u4F5C\u7EC6\u8282" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '1 1 auto', minHeight: 80 }, readOnly: readOnlyProfile, value: detail[activeTab]?.operation_detail ?? '', onChange: (event) => patchTab(activeTab, { operation_detail: event.target.value }) }), activeTab === 'discussing' || activeTab === 'implementing' || activeTab === 'verifying' ? ((0, jsx_runtime_1.jsx)(HardRulePanel, { state: activeTab, readOnly: readOnlyProfile, value: detail.hard_rules?.[activeTab] ?? hard_rules_1.DEFAULT_HARD_RULES[activeTab], overridden: detail.hard_rules?.[activeTab] !== undefined, onChange: (next) => update({ ...detail, hard_rules: { ...(detail.hard_rules ?? {}), [activeTab]: next } }), onReset: () => {
                                    const next = { ...(detail.hard_rules ?? {}) };
                                    delete next[activeTab];
                                    update({ ...detail, hard_rules: next });
                                } })) : null] })) }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: status === 'pending' ? '待保存…'
                                : status === 'saving' ? '保存中…'
                                    : status === 'saved' ? '已自动保存'
                                        : status === 'error' ? '' : '改动会自动保存' }), error !== null ? (0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }, children: error }) : null, (0, jsx_runtime_1.jsx)("span", { style: { marginLeft: 'auto' }, children: (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: restoreFactoryDefaults, disabled: defaults === null || readOnlyProfile, style: {
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid var(--dsw-alias-border-l1)',
                                    background: 'transparent',
                                    color: 'var(--dsw-alias-label-secondary)',
                                    cursor: defaults === null || readOnlyProfile ? 'not-allowed' : 'pointer',
                                    opacity: defaults === null || readOnlyProfile ? 0.6 : 1,
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
        verifying: `（纪律）验收必须给可复跑的证据：每一项「通过」都要附命令 + 输出，或指向具体测试文件（路径 + 跑法）；没有证据的「通过」不算通过。
    
    七项只认工具报备，不认「我检查过了」：
    - workflow_verify_report：结论 pass → ✓，结论 deferred（查出问题但本轮不修）→ ？；两种都要带工作目录内真实存在的锚点，行号不得越界；第 1 / 4 / 7 项还必须带复跑命令。
    - AI 不能直接打勾；要撤销只能调用 workflow_verify_check（done=false）。
    - 没报备的项停在 ○；七项全非 ○ 才能进「已完结」；每次进「验收中」轮次 +1，旧报备自动失效。`,
    };
    //# sourceMappingURL=hard-rules.js.map
    },
    "schema/manual-limits.js": function(__req, module, exports) {
    "use strict";
    /**
     * 手册写入的字数上限。
     *
     * 口径是**字符数**，不是字节：人和 AI 数得清的是字，而注入预算算的是字节。
     * 两个口径分开，报错时两个数都给，才不会被"工具说没超、注入却截了"糊弄。
     *
     * 单独一个无依赖模块：数据层（仓储写入口）要判、接口层（工具报错）要引、
     * 客户端设置页还要显示默认值；不能把 zod 或仓储实现带进客户端包。
     */
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ManualLimitError = exports.CHECK_EVIDENCE_MARK = exports.MANUAL_LIMIT_MAX_CHARS = exports.MANUAL_LIMIT_MIN_CHARS = exports.DEFAULT_MANUAL_LIMITS = void 0;
    exports.countManualChars = countManualChars;
    exports.stripManualEvidence = stripManualEvidence;
    exports.sanitizeManualLimits = sanitizeManualLimits;
    exports.assertSectionLimit = assertSectionLimit;
    exports.assertSessionManualTotal = assertSessionManualTotal;
    exports.DEFAULT_MANUAL_LIMITS = {
        constraints_chars: 300,
        plan_chars: 1200,
        session_total_chars: 2000,
    };
    /** 合法区间：太小会把模板本身卡死，太大会把系统提示撑爆。 */
    exports.MANUAL_LIMIT_MIN_CHARS = 20;
    exports.MANUAL_LIMIT_MAX_CHARS = 20000;
    /** 清单行里「自检证据」的分隔标记：- [x] 条目 ｜ 自检：<证据> */
    exports.CHECK_EVIDENCE_MARK = ' ｜ 自检：';
    /**
     * 按字符（码点）计数。
     *
     * 不用 `text.length`：那是 UTF-16 代码单元数，一个 emoji 会算成 2 个字，
     * 和用户/AI 数出来的字数对不上，报错就会显得在瞎说。
     */
    function countManualChars(text) {
        return Array.from(text).length;
    }
    /** 剥掉每行「｜ 自检：」之后的证据：证据是执行记录，不该占手册字数配额。 */
    function stripManualEvidence(text) {
        return text
            .split(/\r?\n/)
            .map((line) => {
            const cut = line.indexOf(exports.CHECK_EVIDENCE_MARK);
            return cut === -1 ? line : line.slice(0, cut);
        })
            .join('\n');
    }
    /** 把外部传入的上限收成合法值：缺省用默认、非整数四舍五入、越界夹到区间内。 */
    function sanitizeManualLimits(raw) {
        const source = (raw ?? {});
        const read = (value, fallback) => {
            const number = typeof value === 'number' ? value : Number(value);
            if (!Number.isFinite(number))
                return fallback;
            const rounded = Math.round(number);
            return Math.min(exports.MANUAL_LIMIT_MAX_CHARS, Math.max(exports.MANUAL_LIMIT_MIN_CHARS, rounded));
        };
        return {
            constraints_chars: read(source.constraints_chars, exports.DEFAULT_MANUAL_LIMITS.constraints_chars),
            plan_chars: read(source.plan_chars, exports.DEFAULT_MANUAL_LIMITS.plan_chars),
            session_total_chars: read(source.session_total_chars, exports.DEFAULT_MANUAL_LIMITS.session_total_chars),
        };
    }
    /** 有独立字数上限的小节 → 上限字段。没有映射的小节只受整本上限约束。 */
    const SECTION_LIMIT_FIELD = {
        约束: 'constraints_chars',
        方案: 'plan_chars',
    };
    /** 超限时给的具体删法：报错要能照着改，不能只说"请精简"。 */
    const SECTION_TRIM_HINTS = {
        约束: '删掉已被测试或代码固化验证过的条目、只对某个分支成立的临时约定；同类禁令合并成一条。',
        方案: '把已落地的实现细节挪回代码，方案里只留目标、分层和层间契约；长篇论证换成一句"不这么做会怎样"。',
    };
    /** 超限错误：带 code，调用方（工具埋点）靠它把"被闸门拒"和"参数错"分开。 */
    class ManualLimitError extends Error {
        code = 'manual-limit';
        constructor(message) {
            super(message);
            this.name = 'ManualLimitError';
        }
    }
    exports.ManualLimitError = ManualLimitError;
    /**
     * 写入前的硬校验：超了直接抛错。
     * @returns 实际计入的字数（已剥离勾选证据）。
     */
    function assertSectionLimit(section, content, limits) {
        const chars = countManualChars(stripManualEvidence(content));
        const field = SECTION_LIMIT_FIELD[section];
        if (field === undefined)
            return chars;
        const limit = limits[field];
        if (chars > limit) {
            const hint = SECTION_TRIM_HINTS[section] ?? '';
            throw new ManualLimitError(`「${section}」现在 ${chars} 字，上限 ${limit} 字，超 ${chars - limit} 字。${hint}（强制上限，先精简再写）`);
        }
        return chars;
    }
    /**
     * 整本会话手册的字数校验（勾选证据不计入）。
     * @returns 实际计入的字数。
     */
    function assertSessionManualTotal(manual, limits) {
        const chars = countManualChars(stripManualEvidence(manual));
        const limit = limits.session_total_chars;
        if (chars > limit) {
            throw new ManualLimitError(`会话手册整本现在 ${chars} 字，上限 ${limit} 字，超 ${chars - limit} 字。`
                + '先合并同类条目、删掉已被新决策推翻的旧内容；勾选证据（｜ 自检：…）不计入字数，不用为了字数删证据。');
        }
        return chars;
    }
    //# sourceMappingURL=manual-limits.js.map
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
    "client/client-log.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.reportClientEvent = reportClientEvent;
    /**
     * 浏览器半的埋点出口。
     *
     * 为什么要这条通道：宿主的事件环只能证明「服务端做了/没做」，证明不了
     * 「页面拿到节点之后有没有渲染」。这次排查「切到工作流没 UI」时，就卡在
     * 这一跳分不清——是没收到、还是收到了没画出来。所以把浏览器侧的关键跳
     * 发回宿主，和宿主事件落进同一个环，两边能对上时间。
     *
     * 只报「状态变化」，不报每一帧；宿主侧还有速率上限兜底。
     */
    async function reportClientEvent(level, message) {
        try {
            await fetch('/dsh-agent-workflow/client-log', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ level, message }),
            });
        }
        catch {
            // 打点失败不能影响功能：静默丢弃。
        }
    }
    //# sourceMappingURL=client-log.js.map
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
    "client/session-state-store.js": function(__req, module, exports) {
    "use strict";
    /**
     * 侧栏会话状态表（客户端共享单例）。
     *
     * 为什么单独成模块：状态点要能在「一次全量加载」和「单条状态变化」两种入口下更新，
     * 但这两条路径不该各自维护一份数据。这里只做内存表 + 订阅，不碰 DOM、不发请求，
     * 组件和同步逻辑都只是它的使用方。
     */
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WORKFLOW_STATE_CHANGED_EVENT = void 0;
    exports.getSessionState = getSessionState;
    exports.replaceSessionStates = replaceSessionStates;
    exports.setSessionState = setSessionState;
    exports.subscribeSessionStates = subscribeSessionStates;
    exports.readStateChangedDetail = readStateChangedDetail;
    /** 状态变化事件名：推进 / 同意推进 / 新建会话后由徽标派发。 */
    exports.WORKFLOW_STATE_CHANGED_EVENT = 'dsh-workflow-state-changed';
    const states = new Map();
    const listeners = new Set();
    function isNonEmptyString(value) {
        return typeof value === 'string' && value !== '';
    }
    function notify() {
        for (const listener of listeners) {
            try {
                listener();
            }
            catch {
                // 单个订阅者抛错不能拖垮其他行。
            }
        }
    }
    /** 读某个会话的状态；没有返回 null（组件据此不渲染圆点）。 */
    function getSessionState(sessionId) {
        if (!isNonEmptyString(sessionId))
            return null;
        return states.get(sessionId) ?? null;
    }
    /**
     * 全量替换：打开侧栏时同步一次磁盘快照。
     * 空值 / 非法条目直接忽略；有变化才通知，避免无意义重渲染。
     */
    function replaceSessionStates(next) {
        const normalized = Object.entries(next ?? {}).filter(([sessionId, state]) => isNonEmptyString(sessionId) && isNonEmptyString(state));
        if (normalized.length === states.size && normalized.every(([sessionId, state]) => states.get(sessionId) === state)) {
            return;
        }
        states.clear();
        for (const [sessionId, state] of normalized)
            states.set(sessionId, state);
        notify();
    }
    /** 单条更新：状态变化事件走这里，只影响目标会话。 */
    function setSessionState(sessionId, state) {
        if (!isNonEmptyString(sessionId) || !isNonEmptyString(state))
            return false;
        if (states.get(sessionId) === state)
            return false;
        states.set(sessionId, state);
        notify();
        return true;
    }
    /** 订阅状态表变化（组件在挂载时订阅，卸载时退订）；返回退订函数。 */
    function subscribeSessionStates(listener) {
        if (typeof listener !== 'function')
            return () => { };
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }
    /** 解析事件 detail；旧格式（无 detail 的 Event）返回 null，由调用方退回全量重取。 */
    function readStateChangedDetail(event) {
        const detail = event.detail;
        if (detail === undefined || detail === null)
            return null;
        if (!isNonEmptyString(detail.sessionId) || !isNonEmptyString(detail.state))
            return null;
        return { sessionId: detail.sessionId, state: detail.state };
    }
    //# sourceMappingURL=session-state-store.js.map
    },
    "client/workflow-stream.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseWorkflowStreamFrame = parseWorkflowStreamFrame;
    exports.createWorkflowStream = createWorkflowStream;
    exports.workflowStream = workflowStream;
    /**
     * 工作流推送通道（客户端单例）。
     *
     * 为什么要有：宿主改状态、会话被释放、模型请求推进，这些都发生在服务端；
     * 浏览器半拿不到宿主事件，只能轮询。这里订阅宿主的一条 SSE 流，把
     * 「每 3 秒问一次」换成「有事推一次」。
     *
     * 只做三件事：开连接、分发帧、没人订阅就关连接；不碰 DOM、不发业务请求，
     * 方便在 node 里用假 Source 测。
     */
    const client_log_1 = __req("client/client-log.js");
    /** 解析一帧；坏帧返回 null（不要因为一条脏数据把整个通道关掉）。 */
    function parseWorkflowStreamFrame(data) {
        try {
            const parsed = JSON.parse(String(data ?? ''));
            if (typeof parsed?.sessionId !== 'string' || parsed.sessionId === '')
                return null;
            return {
                sessionId: parsed.sessionId,
                reason: typeof parsed.reason === 'string' ? parsed.reason : '',
                state: typeof parsed.state === 'string' && parsed.state !== '' ? parsed.state : null,
            };
        }
        catch {
            return null;
        }
    }
    /**
     * @param openSource 真正打开连接；返回 null 表示环境不支持（浏览器没有 EventSource）。
     * @param onStatus 连接状态变化回调：用来在浏览器侧留一条埋点，区分「没收到推送」和「收到了没渲染」。
     */
    function createWorkflowStream(openSource, onStatus) {
        const listeners = new Set();
        let source = null;
        const notifyStatus = (open) => {
            try {
                onStatus?.(open);
            }
            catch {
                // 状态回调只是埋点，失败不影响通道。
            }
        };
        const close = () => {
            try {
                source?.close();
            }
            catch {
                // 关连接失败没有补救动作，忽略。
            }
            source = null;
        };
        const open = () => {
            if (source !== null)
                return;
            let opened = null;
            try {
                opened = openSource();
            }
            catch {
                opened = null;
            }
            if (opened === null)
                return;
            opened.onopen = () => {
                notifyStatus(true);
            };
            // EventSource 会自己重连；这里只把「断过」报出去，便于排查「界面没更新」。
            opened.onerror = () => {
                notifyStatus(false);
            };
            opened.onmessage = (message) => {
                const event = parseWorkflowStreamFrame(message.data);
                if (event === null)
                    return;
                for (const listener of listeners) {
                    try {
                        listener(event);
                    }
                    catch {
                        // 单个订阅者抛错不能拖垮其他订阅者。
                    }
                }
            };
            source = opened;
        };
        return {
            subscribe(listener) {
                listeners.add(listener);
                open();
                return () => {
                    listeners.delete(listener);
                    if (listeners.size === 0)
                        close();
                };
            },
        };
    }
    let singleton = null;
    /** 页面级单例：所有会话的徽标共用一条连接。 */
    function workflowStream() {
        if (singleton === null) {
            singleton = createWorkflowStream(() => {
                if (typeof EventSource === 'undefined')
                    return null;
                return new EventSource('/dsh-agent-workflow/stream');
            }, (open) => {
                // 连接状态是「界面为什么不更新」这条链路上的第一跳，必须能观测到。
                void (0, client_log_1.reportClientEvent)(open ? 'info' : 'warn', open ? 'stream open' : 'stream error');
            });
        }
        return singleton;
    }
    //# sourceMappingURL=workflow-stream.js.map
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
     * - 数据：第一次挂载时把「所有工作区里已绑定节点的会话状态」整表拉一次（模块内单例 promise），
     *   之后只由状态变化事件按会话更新——不再逐行请求、不再按工作目录缓存 5 秒、不依赖内存名单。
     * - 事件没有 detail 时（旧格式）退回一次全量重取，保证升级路径不会静默失效。
     */
    const react_1 = require("react");
    const node_state_label_1 = __req("schema/node-state-label.js");
    const node_state_color_1 = __req("client/node-state-color.js");
    const session_state_store_1 = __req("client/session-state-store.js");
    /** 全量加载只跑一次；失败时清掉，下一次挂载还能重试。 */
    let loadingPromise = null;
    function loadAllSessionStates() {
        if (loadingPromise !== null)
            return loadingPromise;
        loadingPromise = (async () => {
            try {
                const response = await fetch('/dsh-agent-workflow/sidebar-nodes');
                const responseBody = await response.json().catch(() => null);
                if (responseBody?.ok === true && typeof responseBody.nodes === 'object' && responseBody.nodes !== null) {
                    (0, session_state_store_1.replaceSessionStates)(responseBody.nodes);
                    return;
                }
                // 埋点：接口回了但不是成功结构，必须留痕，否则「一个点都没有」分不清是没数据还是加载失败。
                console.warn(`[dsh-agent-workflow] 侧栏状态全量加载返回异常（HTTP ${response.status}）：`, responseBody?.error ?? responseBody);
            }
            catch (error) {
                // 网络/接口暂时不可用：不缓存失败，下一次挂载重试。
                console.warn('[dsh-agent-workflow] 侧栏状态全量加载失败（下次挂载会重试）：', error);
            }
            loadingPromise = null;
        })();
        return loadingPromise;
    }
    function SessionStateDot(props) {
        const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
        const [state, setState] = (0, react_1.useState)(() => (0, session_state_store_1.getSessionState)(sessionId));
        (0, react_1.useEffect)(() => {
            if (sessionId === '') {
                setState(null);
                return undefined;
            }
            const sync = () => setState((0, session_state_store_1.getSessionState)(sessionId));
            sync();
            const unsubscribe = (0, session_state_store_1.subscribeSessionStates)(sync);
            void loadAllSessionStates().then(sync);
            const onChanged = (event) => {
                const detail = (0, session_state_store_1.readStateChangedDetail)(event);
                if (detail !== null) {
                    // 单条更新：只动这一行，其他会话不受影响。
                    (0, session_state_store_1.setSessionState)(detail.sessionId, detail.state);
                    return;
                }
                // 旧格式事件没有 detail：退回全量重取（下次挂载也会重新加载）。
                loadingPromise = null;
                void loadAllSessionStates().then(sync);
            };
            window.addEventListener(session_state_store_1.WORKFLOW_STATE_CHANGED_EVENT, onChanged);
            return () => {
                unsubscribe();
                window.removeEventListener(session_state_store_1.WORKFLOW_STATE_CHANGED_EVENT, onChanged);
            };
        }, [sessionId]);
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
