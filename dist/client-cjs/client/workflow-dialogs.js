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
const node_state_label_1 = require("../schema/node-state-label");
const hard_rules_1 = require("../schema/hard-rules");
const node_state_color_1 = require("./node-state-color");
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
                        }, children: profiles.map((name) => (0, jsx_runtime_1.jsx)("option", { value: name, children: name }, name)) }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { setSaveAsOpen((value) => !value); setSaveAsName((current) => (current !== '' ? current : (readOnlyProfile ? '我的存档' : `${activeProfile} 副本`))); }, children: "\u53E6\u5B58\u4E3A" }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { void removeProfile(); }, disabled: readOnlyProfile, children: "\u5220\u9664" }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { void refreshProfiles(); }, children: "\u5237\u65B0" }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { void exportProfile(); }, children: "\u5907\u4EFD" }), (0, jsx_runtime_1.jsx)(ProfileToolButton, { onClick: () => { importFileRef.current?.click(); }, children: "\u5BFC\u5165" }), readOnlyProfile ? ((0, jsx_runtime_1.jsxs)("span", { style: { fontSize: 11.5, color: 'var(--dsw-alias-state-warn-primary)' }, children: ["\u300C", BUILTIN_PROFILE_NAME, "\u300D\u968F\u63D2\u4EF6\u63D0\u4F9B\u3001\u4E0D\u53EF\u4FEE\u6539\uFF1B\u8981\u6539\u5148\u300C\u53E6\u5B58\u4E3A\u300D"] })) : null] }), saveAsOpen ? ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                                    } }), (0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'nowrap' }, children: item.label }), index < node_state_color_1.WORKFLOW_FLOW.length - 1 ? ((0, jsx_runtime_1.jsx)("span", { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginLeft: 2 }, children: "\u2192" })) : null] }, item.state))) }), (0, jsx_runtime_1.jsx)("div", { style: { marginTop: 6, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }, children: "\u8FD4\u5DE5\uFF08\u9000\u56DE\u4E0A\u4E00\u9636\u6BB5\uFF09\uFF1A\u5B9E\u73B0\u4E2D \u2192 \u8BA8\u8BBA\u4E2D\uFF1B\u9A8C\u6536\u4E2D \u2192 \u5B9E\u73B0\u4E2D / \u8BA8\u8BBA\u4E2D" })] }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', gap: 4, borderBottom: '1px solid var(--dsw-alias-border-l1)', marginBottom: 12 }, children: STATE_TABS.map((tab) => ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setActiveTab(tab.id), style: {
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
                    // 内置存档只读：整块禁用交互（含改写硬规则），要改先「另存为」
                    opacity: readOnlyProfile ? 0.55 : 1,
                    pointerEvents: readOnlyProfile ? 'none' : 'auto',
                }, children: activeTab === 'shared' ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u516C\u5171\u64CD\u4F5C\u7EC6\u8282 \u00B7 \u4E09\u6001\u901A\u7528" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '1 1 auto' }, value: detail.shared_detail ?? '', onChange: (event) => update({ ...detail, shared_detail: event.target.value }) })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u8FDB\u5165\u8BE5\u72B6\u6001\u540E\u81EA\u52A8\u704C\u5165\u8F93\u5165\u6846\u7684\u9ED8\u8BA4\u6587\u672C\uFF08\u53EF\u7A7A\uFF09" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '0 0 20%', resize: 'none' }, value: detail[activeTab]?.enter_trigger ?? '', placeholder: "\u7559\u7A7A\u5219\u4E0D\u81EA\u52A8\u704C\u5165", onChange: (event) => patchTab(activeTab, { enter_trigger: event.target.value === '' ? null : event.target.value }) }), (0, jsx_runtime_1.jsx)("label", { style: { ...LABEL_STYLE, marginTop: 10 }, children: "\u8BE5\u72B6\u6001\u7684\u64CD\u4F5C\u7EC6\u8282" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '1 1 auto', minHeight: 80 }, value: detail[activeTab]?.operation_detail ?? '', onChange: (event) => patchTab(activeTab, { operation_detail: event.target.value }) }), activeTab === 'discussing' || activeTab === 'implementing' || activeTab === 'verifying' ? ((0, jsx_runtime_1.jsx)(HardRulePanel, { state: activeTab, value: detail.hard_rules?.[activeTab] ?? hard_rules_1.DEFAULT_HARD_RULES[activeTab], overridden: detail.hard_rules?.[activeTab] !== undefined, onChange: (next) => update({ ...detail, hard_rules: { ...(detail.hard_rules ?? {}), [activeTab]: next } }), onReset: () => {
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