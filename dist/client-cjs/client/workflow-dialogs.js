"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowSettingsDialog = WorkflowSettingsDialog;
exports.WorkflowNodeDetailDialog = WorkflowNodeDetailDialog;
const jsx_runtime_1 = require("react/jsx-runtime");
// @ts-nocheck
/**
 * workflow 的两个弹窗：
 * - 全局操作细节（A 公共 + B/C/D 三态），每个 workflow 工作区各一份，存在快照的 settings 里；
 * - 节点操作细节（只读展示 A + B/C/D，并标出该节点覆盖了哪一条）。
 *
 * 样式全部用主题变量内联，不依赖 CSS Module，深浅色自动跟随。
 */
const react_1 = require("react");
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
const OVERLAY_STYLE = {
    position: 'fixed',
    inset: 0,
    zIndex: 1199,
    background: 'rgba(0,0,0,.45)',
};
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
function Modal(props) {
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { style: OVERLAY_STYLE, onClick: props.onClose }), (0, jsx_runtime_1.jsxs)("div", { style: PANEL_STYLE, role: "dialog", "aria-label": props.title, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, children: [(0, jsx_runtime_1.jsx)("strong", { style: { fontSize: 14 }, children: props.title }), (0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": "\u5173\u95ED", onClick: props.onClose, style: { border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }, children: "\u00D7" })] }), props.children, props.footer === undefined ? null : (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }, children: props.footer })] })] }));
}
function Button(props) {
    return ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: props.onClick, style: {
            height: 28,
            padding: '0 14px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            border: props.primary === true ? 'none' : '1px solid var(--dsw-alias-border-l1)',
            background: props.primary === true ? 'var(--dsw-alias-brand-primary)' : 'transparent',
            color: props.primary === true ? '#fff' : 'var(--dsw-alias-label-primary)',
        }, children: props.label }));
}
function StateDetailFields(props) {
    const { title, detail, onChange, highlight } = props;
    return ((0, jsx_runtime_1.jsxs)("div", { style: {
            border: '1px solid var(--dsw-alias-border-l1)',
            borderRadius: 8,
            padding: 10,
            marginBottom: 10,
            background: highlight === true ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
        }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontWeight: 600, marginBottom: 8 }, children: [title, highlight === true ? (0, jsx_runtime_1.jsx)("span", { style: { marginLeft: 6, fontSize: 11, color: 'var(--dsw-alias-brand-primary)' }, children: "\u5F53\u524D\u6001" }) : null] }), (0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u64CD\u4F5C\u7EC6\u8282" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, minHeight: 54 }, value: detail.operation_detail, onChange: (event) => onChange({ ...detail, operation_detail: event.target.value }) }), (0, jsx_runtime_1.jsx)("label", { style: { ...LABEL_STYLE, marginTop: 8 }, children: "\u8FDB\u5165\u540E\u9ED8\u8BA4\u8F93\u5165\uFF08\u53EF\u7A7A\uFF09" }), (0, jsx_runtime_1.jsx)("input", { style: FIELD_STYLE, value: detail.enter_trigger ?? '', placeholder: "\u7559\u7A7A\u5219\u4E0D\u81EA\u52A8\u704C\u5165\u8F93\u5165\u6846", onChange: (event) => onChange({ ...detail, enter_trigger: event.target.value === '' ? null : event.target.value }) })] }));
}
/** 全局操作细节（A + B/C/D）编辑弹窗：按 workflow 保存到该快照的 settings。 */
function WorkflowSettingsDialog(props) {
    const { workflowId, onClose } = props;
    const [detail, setDetail] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const [saving, setSaving] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        void (async () => {
            try {
                const response = await fetch(`/dsh-agent-workflow/settings?id=${encodeURIComponent(workflowId)}`);
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
    }, [workflowId]);
    const save = async () => {
        if (detail === null)
            return;
        setSaving(true);
        setError(null);
        try {
            const response = await fetch('/dsh-agent-workflow/settings-save', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: workflowId, globalOperationDetail: detail }),
            });
            const data = await response.json().catch(() => null);
            if (data?.ok === true)
                onClose();
            else
                setError(String(data?.error ?? '保存失败'));
        }
        catch (reason) {
            setError(String(reason));
        }
        finally {
            setSaving(false);
        }
    };
    return ((0, jsx_runtime_1.jsxs)(Modal, { title: "\u64CD\u4F5C\u7EC6\u8282\u8BBE\u7F6E\uFF08\u5168\u5C40\uFF09", onClose: onClose, footer: ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(Button, { label: "\u53D6\u6D88", onClick: onClose }), (0, jsx_runtime_1.jsx)(Button, { label: saving ? '保存中…' : '保存', onClick: () => void save(), primary: true })] })), children: [error !== null ? (0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-state-error-primary)', marginBottom: 8 }, children: error }) : null, detail === null ? ((0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)' }, children: "\u52A0\u8F7D\u4E2D\u2026" })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10, marginBottom: 10 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 600, marginBottom: 8 }, children: "\u516C\u5171\u64CD\u4F5C\u7EC6\u8282\uFF08A\uFF09" }), (0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u4E09\u6001\u901A\u7528\uFF0C\u6BCF\u4E2A\u8282\u70B9\u90FD\u4F1A\u8BFB\u5230" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, minHeight: 54 }, value: detail.shared_detail ?? '', onChange: (event) => setDetail({ ...detail, shared_detail: event.target.value }) })] }), (0, jsx_runtime_1.jsx)(StateDetailFields, { title: "\u8BA8\u8BBA\u4E2D\uFF08B\uFF09", detail: detail.discussing, onChange: (next) => setDetail({ ...detail, discussing: next }) }), (0, jsx_runtime_1.jsx)(StateDetailFields, { title: "\u5B9E\u73B0\u4E2D\uFF08C\uFF09", detail: detail.implementing, onChange: (next) => setDetail({ ...detail, implementing: next }) }), (0, jsx_runtime_1.jsx)(StateDetailFields, { title: "\u9A8C\u6536\u4E2D\uFF08D\uFF09", detail: detail.verifying, onChange: (next) => setDetail({ ...detail, verifying: next }) })] }))] }));
}
/** 节点操作细节弹窗：展示该节点当前生效的 A + B/C/D，并标出节点自己覆盖的条目。 */
function WorkflowNodeDetailDialog(props) {
    const { workflowId, nodeId, onClose } = props;
    const [payload, setPayload] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
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
    const overrides = payload?.overrides ?? null;
    const currentState = payload?.node?.current_state ?? null;
    const labels = { discussing: '讨论中（B）', implementing: '实现中（C）', verifying: '验收中（D）' };
    return ((0, jsx_runtime_1.jsxs)(Modal, { title: `操作细节 · ${payload?.node?.title ?? '节点'}`, onClose: onClose, children: [error !== null ? (0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-state-error-primary)' }, children: error }) : null, payload === null ? ((0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)' }, children: "\u52A0\u8F7D\u4E2D\u2026" })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { style: { color: 'var(--dsw-alias-label-secondary)', marginBottom: 10 }, children: ["\u5F53\u524D\u72B6\u6001\uFF1A", currentState, overrides !== null ? '（该节点有覆盖项，标注为「已覆盖」）' : '（沿用全局设置）'] }), (0, jsx_runtime_1.jsxs)("div", { style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10, marginBottom: 10 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "\u516C\u5171\u64CD\u4F5C\u7EC6\u8282\uFF08A\uFF09" }), (0, jsx_runtime_1.jsx)("div", { style: { whiteSpace: 'pre-wrap', lineHeight: 1.6 }, children: payload.global.shared_detail })] }), ['discussing', 'implementing', 'verifying'].map((state) => {
                        const global = payload.global[state];
                        const override = overrides?.[state];
                        const shown = override ?? global;
                        return ((0, jsx_runtime_1.jsxs)("div", { style: {
                                border: '1px solid var(--dsw-alias-border-l1)',
                                borderRadius: 8,
                                padding: 10,
                                marginBottom: 10,
                                background: currentState === state ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                            }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: [labels[state], currentState === state ? (0, jsx_runtime_1.jsx)("span", { style: { marginLeft: 6, fontSize: 11, color: 'var(--dsw-alias-brand-primary)' }, children: "\u5F53\u524D\u6001" }) : null, override !== undefined ? (0, jsx_runtime_1.jsx)("span", { style: { marginLeft: 6, fontSize: 11, color: 'var(--dsw-alias-state-warn-primary)' }, children: "\u5DF2\u8986\u76D6" }) : null] }), (0, jsx_runtime_1.jsx)("div", { style: { whiteSpace: 'pre-wrap', lineHeight: 1.6 }, children: shown.operation_detail }), shown.enter_trigger !== null && shown.enter_trigger !== '' ? ((0, jsx_runtime_1.jsxs)("div", { style: { marginTop: 6, color: 'var(--dsw-alias-label-secondary)' }, children: ["\u8FDB\u5165\u540E\u9ED8\u8BA4\u8F93\u5165\uFF1A", shown.enter_trigger] })) : null] }, state));
                    })] }))] }));
}
//# sourceMappingURL=workflow-dialogs.js.map