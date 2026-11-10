"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowGlobalSettingsSection = WorkflowGlobalSettingsSection;
exports.applyWorkflowSettingsSection = applyWorkflowSettingsSection;
exports.WorkflowSettingsDialog = WorkflowSettingsDialog;
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
const node_state_label_1 = require("../schema/node-state-label");
const LABEL_STYLE = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4, display: 'block' };
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
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { style: OVERLAY_STYLE, onClick: props.onClose }), (0, jsx_runtime_1.jsxs)("div", { style: PANEL_STYLE, role: "dialog", "aria-label": props.title, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, children: [(0, jsx_runtime_1.jsx)("strong", { style: { fontSize: 14 }, children: props.title }), (0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": "\u5173\u95ED", onClick: props.onClose, style: { border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }, children: "\u00D7" })] }), props.children] })] }));
}
const STATE_TABS = [
    { id: 'shared', label: '公共' },
    { id: 'discussing', label: '讨论中' },
    { id: 'implementing', label: '实现中' },
    { id: 'verifying', label: '验收中' },
];
/**
 * 设置页里的「操作细节」分区内容。
 * A/B/C/D 四个页签横向排开；每个状态页签内：默认输入在上（20%），操作细节在下（80%）。
 */
function WorkflowGlobalSettingsSection() {
    const [detail, setDetail] = (0, react_1.useState)(null);
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
                const data = await response.json().catch(() => null);
                if (cancelled)
                    return;
                if (data?.ok === true)
                    setDetail(data.globalOperationDetail);
                else
                    setError(String(data?.error ?? '读取设置失败'));
            }
            catch (reason) {
                if (!cancelled)
                    setError(String(reason));
            }
        })();
        return () => { cancelled = true; };
    }, []);
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
            const data = await response.json().catch(() => null);
            if (data?.ok === true) {
                setStatus('saved');
                window.setTimeout(() => setStatus((current) => (current === 'saved' ? 'idle' : current)), 1600);
            }
            else {
                setStatus('error');
                setError(String(data?.error ?? '保存失败'));
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
    return ((0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginBottom: 12 }, children: "\u8FD9\u4E9B\u64CD\u4F5C\u7EC6\u8282\u662F\u5E94\u7528\u7EA7\u5168\u5C40\u7684\uFF0C\u6240\u6709 workflow \u8282\u70B9\u5728\u5BF9\u5E94\u72B6\u6001\u4E0B\u90FD\u4F1A\u8BFB\u5230\uFF1B\u8282\u70B9\u53EF\u4EE5\u5355\u72EC\u8986\u76D6\u81EA\u5DF1\u5F53\u524D\u72B6\u6001\u90A3\u4E00\u6761\u3002" }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', gap: 4, borderBottom: '1px solid var(--dsw-alias-border-l1)', marginBottom: 12 }, children: STATE_TABS.map((tab) => ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setActiveTab(tab.id), style: {
                        padding: '6px 12px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === tab.id ? '2px solid var(--dsw-alias-brand-primary)' : '2px solid transparent',
                        color: activeTab === tab.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                        cursor: 'pointer',
                        fontSize: 12,
                    }, children: tab.label }, tab.id))) }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', flexDirection: 'column', height: 380 }, children: activeTab === 'shared' ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u516C\u5171\u64CD\u4F5C\u7EC6\u8282 \u00B7 \u4E09\u6001\u901A\u7528" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '1 1 auto' }, value: detail.shared_detail ?? '', onChange: (event) => update({ ...detail, shared_detail: event.target.value }) })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u8FDB\u5165\u8BE5\u72B6\u6001\u540E\u81EA\u52A8\u704C\u5165\u8F93\u5165\u6846\u7684\u9ED8\u8BA4\u6587\u672C\uFF08\u53EF\u7A7A\uFF09" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '0 0 20%', resize: 'none' }, value: detail[activeTab]?.enter_trigger ?? '', placeholder: "\u7559\u7A7A\u5219\u4E0D\u81EA\u52A8\u704C\u5165", onChange: (event) => patchTab(activeTab, { enter_trigger: event.target.value === '' ? null : event.target.value }) }), (0, jsx_runtime_1.jsx)("label", { style: { ...LABEL_STYLE, marginTop: 10 }, children: "\u8BE5\u72B6\u6001\u7684\u64CD\u4F5C\u7EC6\u8282" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '1 1 80%' }, value: detail[activeTab]?.operation_detail ?? '', onChange: (event) => patchTab(activeTab, { operation_detail: event.target.value }) })] })) }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: status === 'pending' ? '待保存…'
                            : status === 'saving' ? '保存中…'
                                : status === 'saved' ? '已自动保存'
                                    : status === 'error' ? '' : '改动会自动保存' }), error !== null ? (0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }, children: error }) : null] })] }));
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
                const data = await response.json().catch(() => null);
                if (cancelled)
                    return;
                if (data?.ok === true)
                    setPayload(data);
                else
                    setError(String(data?.error ?? '读取失败'));
            }
            catch (reason) {
                if (!cancelled)
                    setError(String(reason));
            }
        })();
        return () => { cancelled = true; };
    }, [workflowId, nodeId]);
    // 工作手册 / 摘要只读展示（AI 自留记录，人只读）。
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        void (async () => {
            try {
                const response = await fetch(`/dsh-agent-workflow/node-manual?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
                const data = await response.json().catch(() => null);
                if (cancelled || data?.ok !== true)
                    return;
                setManualData(data.manual === null
                    ? null
                    : {
                        manual: String(data.manual?.manual ?? ''),
                        summary: String(data.manual?.summary ?? ''),
                        workDir: String(data.manual?.workDir ?? ''),
                        parentSummary: String(data.parentSummary ?? ''),
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
                const data = await response.json().catch(() => null);
                setNoteStatus(data?.ok === true ? '已保存' : String(data?.error ?? '保存失败'));
            }
            catch (reason) {
                setNoteStatus(String(reason));
            }
        }, 700);
    };
    return ((0, jsx_runtime_1.jsxs)(Modal, { title: `节点补充说明 · ${payload?.node?.title ?? '节点'}`, onClose: onClose, children: [error !== null ? (0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-state-error-primary)' }, children: error }) : null, payload === null ? ((0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)' }, children: "\u52A0\u8F7D\u4E2D\u2026" })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }, children: [(0, jsx_runtime_1.jsxs)("span", { style: { color: 'var(--dsw-alias-label-secondary)' }, children: ["\u5F53\u524D\u72B6\u6001\uFF1A", node_state_label_1.NODE_STATE_LABEL[currentState] ?? currentState, noteStatus === null ? '' : `　${noteStatus}`] }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => {
                                    // 先关掉当前弹窗，再让上层打开设置：避免两层遮罩叠在一起。
                                    onOpenSettings?.();
                                    onClose();
                                }, style: {
                                    height: 24,
                                    padding: '0 10px',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    border: '1px solid var(--dsw-alias-border-l1)',
                                    background: 'transparent',
                                    color: 'var(--dsw-alias-brand-primary)',
                                }, children: "\u6253\u5F00\u64CD\u4F5C\u7EC6\u8282\u8BBE\u7F6E \u2192" }), manualData !== null && manualData.workDir !== '' ? ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => {
                                    void fetch('/dsh-agent-workflow/open-folder', {
                                        method: 'POST',
                                        headers: { 'content-type': 'application/json' },
                                        body: JSON.stringify({ path: manualData.workDir }),
                                    });
                                }, style: {
                                    height: 24,
                                    padding: '0 10px',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    border: '1px solid var(--dsw-alias-border-l1)',
                                    background: 'transparent',
                                    color: 'var(--dsw-alias-label-primary)',
                                }, children: "\u6253\u5F00\u6587\u4EF6\u5939" })) : null] }), (0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginBottom: 10 }, children: "\u5168\u5C40\u7684\u64CD\u4F5C\u7EC6\u8282\u5728\u300C\u8BBE\u7F6E \u2192 Agent \u5DE5\u4F5C\u6D41\u300D\u91CC\uFF1B\u8FD9\u91CC\u53EA\u5199\u8FD9\u4E2A\u8282\u70B9\u989D\u5916\u8981\u6CE8\u610F\u7684\uFF0C\u4F1A\u63A5\u5728\u5168\u5C40\u540E\u9762\u3002" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            border: '1px solid var(--dsw-alias-border-l1)',
                            borderRadius: 8,
                            padding: 10,
                            marginBottom: 10,
                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "\u672C\u8282\u70B9\u9644\u52A0\uFF08\u6240\u6709\u72B6\u6001\u90FD\u4F1A\u8FFD\u52A0\uFF09" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, minHeight: 52 }, placeholder: "\u7559\u7A7A\u5219\u4E0D\u8FFD\u52A0", value: notes.global ?? '', onChange: (event) => saveNote('global', event.target.value) })] }), manualData !== null ? ((0, jsx_runtime_1.jsxs)("div", { style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10, marginBottom: 10 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "\u5DE5\u4F5C\u624B\u518C\uFF08AI \u81EA\u7559\uFF0C\u53EA\u8BFB\uFF09" }), (0, jsx_runtime_1.jsx)("div", { style: { whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 180, overflow: 'auto', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: manualData.manual.trim() !== '' ? manualData.manual : '（还没有内容）' }), manualData.parentSummary.trim() !== '' ? ((0, jsx_runtime_1.jsxs)("div", { style: { marginTop: 8 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }, children: "\u4E0A\u7EA7\u624B\u518C\u6458\u8981\uFF08\u4EC5\u4E00\u5C42\uFF09" }), (0, jsx_runtime_1.jsx)("div", { style: { whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 120, overflow: 'auto', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: manualData.parentSummary })] })) : null] })) : null, ['discussing', 'implementing', 'verifying'].map((state) => {
                        return ((0, jsx_runtime_1.jsxs)("div", { style: {
                                border: '1px solid var(--dsw-alias-border-l1)',
                                borderRadius: 8,
                                padding: 10,
                                marginBottom: 10,
                                background: currentState === state ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                            }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: [labels[state], currentState === state ? (0, jsx_runtime_1.jsx)("span", { style: { marginLeft: 6, fontSize: 11, color: 'var(--dsw-alias-brand-primary)' }, children: "\u5F53\u524D\u6001" }) : null] }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, minHeight: 52 }, placeholder: "\u7559\u7A7A\u5219\u4E0D\u8FFD\u52A0", value: notes[state] ?? '', onChange: (event) => saveNote(state, event.target.value) })] }, state));
                    })] }))] }));
}
//# sourceMappingURL=workflow-dialogs.js.map