// @ts-nocheck
/**
 * workflow 的界面块：
 * - 设置页里的「操作细节」分区（应用级全局 A + B/C/D，四个页签）；
 * - 节点操作细节弹窗（只读展示该节点生效的 A + B/C/D，标出覆盖项）。
 *
 * 样式全部用主题变量内联，深浅色自动跟随，不依赖 CSS Module。
 */
import { useEffect, useRef, useState } from 'react';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { DEFAULT_HARD_RULES } from '../schema/hard-rules';
import { DEFAULT_MANUAL_LIMITS, MANUAL_LIMIT_MAX_CHARS, MANUAL_LIMIT_MIN_CHARS } from '../schema/manual-limits';
import { NODE_STATE_COLOR, WORKFLOW_FLOW } from './node-state-color';
import { reportClientEvent } from './client-log';

const LABEL_STYLE = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4, display: 'block' } as const;

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
} as const;

const OVERLAY_STYLE = { position: 'fixed', inset: 0, zIndex: 1199, background: 'rgba(0,0,0,.45)' } as const;

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
} as const;

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
} as const;

function Modal(props: { title: string; onClose: () => void; children: any; fixedHeight?: number | string }) {
  const fixed = props.fixedHeight !== undefined;
  const panelStyle = fixed
    ? {
        ...PANEL_STYLE,
        height: props.fixedHeight,
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
      }
    : PANEL_STYLE;
  return (
    <>
      <div style={OVERLAY_STYLE} onClick={props.onClose} />
      <div style={panelStyle} role="dialog" aria-label={props.title}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flex: '0 0 auto' }}>
          <strong style={{ fontSize: 14 }}>{props.title}</strong>
          <button
            type="button"
            aria-label="关闭"
            onClick={props.onClose}
            style={{ border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >×</button>
        </div>
        {fixed ? (
          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>{props.children}</div>
        ) : props.children}
      </div>
    </>
  );
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

/** 附表的两组条目：字段与 GET /dsh-agent-workflow/appendix 的返回一一对应。 */
interface AppendixPlanSection { id: number; title: string; hint: string }
interface AppendixVerifyItem { id: number; name: string; judge: string; needsCommand: boolean }

/**
 * 附表：设置页里的只读清单。
 *
 * 内容不在客户端写死——点开页签（组件挂载）时才去 /appendix 现取；
 * 读失败给错误 + 重试，绝不用空清单冒充「五项是空的」。
 */
function AppendixPanel() {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [planSections, setPlanSections] = useState<AppendixPlanSection[]>([]);
  const [planFallback, setPlanFallback] = useState('');
  const [verifyItems, setVerifyItems] = useState<AppendixVerifyItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError('');
    void (async () => {
      try {
        const response = await fetch('/dsh-agent-workflow/appendix');
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (body?.ok !== true) {
          const message = String(body?.error ?? '读取附表失败');
          setStatus('error');
          setError(message);
          void reportClientEvent('warn', `[appendix] 读取失败（路由）：${message}`);
          return;
        }
        setPlanSections(Array.isArray(body.planSections) ? body.planSections : []);
        setPlanFallback(typeof body.planFallback === 'string' ? body.planFallback : '');
        setVerifyItems(Array.isArray(body.verifyItems) ? body.verifyItems : []);
        setStatus('ready');
        // 成功也要留一跳：服务端只证明「返回了」，这条才证明「页面拿到了」。
        void reportClientEvent('info', `[appendix] 已取回 方案 ${Array.isArray(body.planSections) ? body.planSections.length : 0} 条 / 验收 ${Array.isArray(body.verifyItems) ? body.verifyItems.length : 0} 条`);
      } catch (reason) {
        if (!cancelled) {
          setStatus('error');
          setError(String(reason));
          void reportClientEvent('warn', `[appendix] 读取失败（异常）：${String(reason)}`);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  if (status === 'loading') {
    return <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>读取中…</div>;
  }
  if (status === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 }}>读不到附表：{error}</div>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'transparent',
            color: 'var(--dsw-alias-label-primary)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >重试</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', overflow: 'auto', minHeight: 0 }}>
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <div style={LABEL_STYLE}>实现中 · 五项（方案五小节，解析自会话手册模板）</div>
        {planSections.length > 0 ? planSections.map((section) => (
          <div key={section.id} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{section.id}. {section.title}</div>
            {section.hint !== '' ? (
              <div style={{ fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5 }}>{section.hint}</div>
            ) : null}
          </div>
        )) : (
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', margin: 0, lineHeight: 1.5 }}>{planFallback}</pre>
        )}
      </div>
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <div style={LABEL_STYLE}>验收中 · 七项（七项验收项）</div>
        {verifyItems.map((item) => (
          <div key={item.id} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {item.id}. {item.name}
              {item.needsCommand ? (
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--dsw-alias-brand-primary)' }}>必须带复跑命令</span>
              ) : null}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5 }}>{item.judge}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


/**
 * 设置页里的「操作细节」分区内容。
 * A/B/C/D 四个页签横向排开；每个状态页签内：默认输入在上（20%），操作细节在下（80%）。
 */
/** 阶段硬规则面板：默认收起（只留标题行），点「展开」看全文；点「改写」先警告，确认后才解锁编辑。 */
function HardRulePanel(props: {
  state: string;
  value: string;
  overridden: boolean;
  /** 内置「默认存档」只读：正文照常可滚动、可选中复制，只锁「改写 / 恢复默认」两个动作。 */
  readOnly?: boolean;
  onChange: (next: string) => void;
  onReset: () => void;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const label = props.state === 'discussing' ? '讨论中' : props.state === 'implementing' ? '实现中' : '验收中';
  const showBody = expanded || unlocked;
  return (
    <div style={{
      marginTop: 8,
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 8,
      padding: '5px 8px',
      background: 'var(--dsw-alias-bg-base)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          本阶段硬规则（插件层，只读）· {label}
        </span>
        <span style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          {props.overridden && props.readOnly !== true ? (
            <button
              type="button"
              onClick={props.onReset}
              style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', textDecoration: 'underline' }}
            >恢复默认</button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', textDecoration: 'underline' }}
          >{showBody ? '收起' : '展开'}</button>
          {props.readOnly === true ? null : (
            <button
              type="button"
              onClick={() => { setUnlocked((value) => !value); setExpanded(true); }}
              style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 11.5, color: 'var(--dsw-alias-brand-primary)', textDecoration: 'underline' }}
            >{unlocked ? '完成改写' : '改写硬规则'}</button>
          )}
        </span>
      </div>
      {showBody ? (
        <div style={{ marginTop: 5 }}>
          {unlocked ? (
            <>
              <div style={{ fontSize: 11.5, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5, marginBottom: 4 }}>
                ⚠ 硬规则用于阶段推进校验（方案是否写进手册、清单是否全勾）。改了可能导致校验与你的预期不符，确认后再改。
              </div>
              <textarea
                style={{ ...FIELD_STYLE, minHeight: 80 }}
                value={props.value}
                onChange={(event) => props.onChange(event.target.value)}
              />
            </>
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)', maxHeight: 96, overflow: 'auto' }}>
              {props.value}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** 设置页顶部那排小按钮：统一尺寸，避免每处手写 style。 */
function ProfileToolButton(props: { onClick: () => void; disabled?: boolean; children: any }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled === true}
      style={{
        height: 26,
        padding: '0 10px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: props.disabled === true ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-label-primary)',
        fontSize: 12,
        cursor: props.disabled === true ? 'default' : 'pointer',
        opacity: props.disabled === true ? 0.6 : 1,
      }}
    >{props.children}</button>
  );
}

function WorkflowGlobalSettingsSection() {
  const [detail, setDetail] = useState<any>(null);
  const [defaults, setDefaults] = useState<any>(null);
  const [autoSend, setAutoSend] = useState(false);
  /** 手册字数上限（字符数）：应用级，写进 app-settings.json，写手册时按它拒写。 */
  const [limits, setLimits] = useState({ ...DEFAULT_MANUAL_LIMITS });
  const [activeTab, setActiveTab] = useState('shared');
  const [status, setStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<string[]>([BUILTIN_PROFILE_NAME]);
  const [activeProfile, setActiveProfile] = useState<string>(BUILTIN_PROFILE_NAME);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importName, setImportName] = useState('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<any>(null);
  const latestRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/dsh-agent-workflow/global-settings');
        const responseBody = await response.json().catch(() => null);
        if (cancelled) return;
        if (responseBody?.ok === true) {
          setDetail(responseBody.globalOperationDetail);
          setDefaults(responseBody.defaults ?? null);
          setProfiles(Array.isArray(responseBody.profiles) && responseBody.profiles.length > 0
            ? responseBody.profiles
            : [BUILTIN_PROFILE_NAME]);
          setActiveProfile(String(responseBody.activeProfile ?? BUILTIN_PROFILE_NAME));
        } else setError(String(responseBody?.error ?? '读取设置失败'));
      } catch (reason) {
        if (!cancelled) setError(String(reason));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** 存档相关的写操作统一走这里：成功就刷新列表与内容。 */
  const callProfileRoute = async (route: string, payload: unknown): Promise<boolean> => {
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
      if (list !== null && list.length > 0) setProfiles(list);
      if (typeof body.activeProfile === 'string') setActiveProfile(body.activeProfile);
      else if (typeof body.active === 'string') setActiveProfile(body.active);
      if (body.globalOperationDetail !== undefined) setDetail(body.globalOperationDetail);
      return true;
    } catch (reason) {
      window.alert(String(reason));
      return false;
    }
  };

  // 应用级开关：切换状态时是否自动发送默认输入（默认关闭）。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/dsh-agent-workflow/app-settings');
        const responseBody = await response.json().catch(() => null);
        if (!cancelled && responseBody?.ok === true) {
          setAutoSend(responseBody.autoSendEnterTrigger === true);
          if (responseBody.manualLimits !== undefined && responseBody.manualLimits !== null) {
            setLimits({ ...DEFAULT_MANUAL_LIMITS, ...responseBody.manualLimits });
          }
        }
      } catch {
        // 读不到就按默认（关闭）。
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveAutoSend = async (next: boolean) => {
    setAutoSend(next);
    try {
      await fetch('/dsh-agent-workflow/app-settings-save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ autoSendEnterTrigger: next }),
      });
    } catch (reason) {
      console.warn('[dsh-agent-workflow] 保存自动发送开关失败：', reason);
    }
  };

  /** 手册字数上限：失焦即存；越界值由后端收成合法区间，这里只做输入框约束。 */
  const saveLimit = async (field: 'constraints_chars' | 'plan_chars' | 'session_total_chars', raw: string) => {
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? Math.round(parsed) : DEFAULT_MANUAL_LIMITS[field];
    const next = { ...limits, [field]: value };
    setLimits(next);
    try {
      const response = await fetch('/dsh-agent-workflow/app-settings-save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manualLimits: next }),
      });
      const body = await response.json().catch(() => null);
      if (body?.ok === true && body.manualLimits !== undefined) setLimits({ ...DEFAULT_MANUAL_LIMITS, ...body.manualLimits });
      else if (body?.ok !== true) window.alert(String(body?.error ?? '保存手册上限失败'));
    } catch (reason) {
      window.alert(String(reason));
    }
  };

  /** 真正落盘：只由防抖计时器或卸载时的兜底调用。 */
  const persist = async (value: any) => {
    setStatus('saving');    setError(null);
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
      } else {
        setStatus('error');
        setError(String(responseBody?.error ?? '保存失败'));
      }
    } catch (reason) {
      setStatus('error');
      setError(String(reason));
    }
  };

  const readOnlyProfile = activeProfile === BUILTIN_PROFILE_NAME;

  const switchProfile = async (name: string) => {
    if (name === activeProfile) return;
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
    if (readOnlyProfile) return;
    if (!window.confirm(`删除存档「${activeProfile}」？删掉后会回到「${BUILTIN_PROFILE_NAME}」。`)) return;
    await callProfileRoute('profiles-delete', { name: activeProfile });
  };

  const exportProfile = async () => {
    if (await callProfileRoute('profiles-export', {})) window.alert('已备份到 exports/backup/，并已在资源管理器里打开。');
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
      if (Array.isArray(body.profiles) && body.profiles.length > 0) setProfiles(body.profiles);
      if (typeof body.activeProfile === 'string') setActiveProfile(body.activeProfile);
      if (body.globalOperationDetail !== undefined) setDetail(body.globalOperationDetail);
    } catch (reason) {
      window.alert(String(reason));
    }
  };

  /** 选一个 json 文件导入成存档：文件名即存档名。 */
  const pickImportFile = async (event: any) => {
    const file: File | undefined = event?.target?.files?.[0];
    if (event?.target) event.target.value = ''; // 允许再次选同一个文件
    if (file === undefined) return;
    try {
      const text = await file.text();
      const name = file.name.replace(/\.json$/i, '');
      if (await callProfileRoute('profiles-import', { name, json: text })) {
        window.alert(`已导入「${name}」，可在下拉里选它。`);
      }
    } catch (reason) {
      window.alert(String(reason));
    }
  };


  /** 改动即排一次防抖保存（700ms），不需要「保存」按钮。 */
  const update = (next: any) => {
    if (readOnlyProfile) return; // 内置存档只读：要改先另存为
    setDetail(next);
    latestRef.current = next;
    setStatus('pending');
    setError(null);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void persist(next);
    }, 700);
  };

  /** 恢复出厂默认：用服务端返回的默认值覆盖当前全部操作细节，并清掉硬规则覆盖值。 */
  const restoreFactoryDefaults = () => {
    if (defaults === null) return;
    const confirmed = window.confirm('恢复出厂默认？会覆盖当前所有操作细节（公共 / 讨论中 / 实现中 / 验收中），硬规则覆盖值也会一起清掉。');
    if (!confirmed) return;
    update({ ...defaults, hard_rules: {} });
  };

  // 卸载（关设置页）时把还没落盘的改动补写一次，避免丢最后几个字。
  useEffect(() => () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (latestRef.current !== null) void persist(latestRef.current);
    }
  }, []);

  if (detail === null) {
    return <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>{error ?? '加载中…'}</div>;
  }

  const patchTab = (tabId: string, patch: any) => (
    update({ ...detail, [tabId]: { ...detail[tabId], ...patch } })
  );

  return (
    <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-primary)' }}>
      <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginBottom: 12 }}>
        这些操作细节是应用级全局的，所有 workflow 节点在对应状态下都会读到；节点可以单独覆盖自己当前状态那一条。
      </div>

      {/* 存档：「默认存档」随插件提供、只读；其余是用户自己的，可切换 / 另存为 / 删除 / 导出 / 导入。 */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>存档</span>
        <select
          value={activeProfile}
          onChange={(event) => { void switchProfile(event.target.value); }}
          style={{
            height: 26,
            borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'var(--dsw-alias-bg-base)',
            color: 'var(--dsw-alias-label-primary)',
            fontSize: 12,
            padding: '0 6px',
          }}
        >
          {profiles.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <ProfileToolButton onClick={() => { setSaveAsOpen((value) => !value); setSaveAsName((current) => (current !== '' ? current : (readOnlyProfile ? '我的存档' : `${activeProfile} 副本`))); }}>另存为</ProfileToolButton>
        <ProfileToolButton onClick={() => { void removeProfile(); }} disabled={readOnlyProfile}>删除</ProfileToolButton>
        <ProfileToolButton onClick={() => { void refreshProfiles(); }}>刷新</ProfileToolButton>
        <ProfileToolButton onClick={() => { void exportProfile(); }}>备份</ProfileToolButton>
        <ProfileToolButton onClick={() => { importFileRef.current?.click(); }}>导入</ProfileToolButton>
        {readOnlyProfile ? (
          <span style={{ fontSize: 11.5, color: 'var(--dsw-alias-state-warn-primary)' }}>
            「{BUILTIN_PROFILE_NAME}」随插件提供、不可修改；要改先「另存为」
          </span>
        ) : null}
      </div>

      {/* 手册字数上限：写手册时按这里的数字拒写（按字判，勾选证据不计入）。 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 12,
        fontSize: 12,
        color: 'var(--dsw-alias-label-secondary)',
      }}>
        <span>手册字数上限</span>
        {([
          { field: 'constraints_chars', label: '约束 / 红线' },
          { field: 'plan_chars', label: '方案' },
          { field: 'session_total_chars', label: '会话手册整本' },
        ] as const).map((item) => (
          <label key={item.field} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span>{item.label}</span>
            <input
              type="number"
              min={MANUAL_LIMIT_MIN_CHARS}
              max={MANUAL_LIMIT_MAX_CHARS}
              value={limits[item.field]}
              onChange={(event) => setLimits({ ...limits, [item.field]: Number(event.target.value) })}
              onBlur={(event) => { void saveLimit(item.field, event.target.value); }}
              style={{
                width: 72,
                height: 24,
                borderRadius: 6,
                border: '1px solid var(--dsw-alias-border-l1)',
                background: 'var(--dsw-alias-bg-base)',
                color: 'var(--dsw-alias-label-primary)',
                fontSize: 12,
                padding: '0 6px',
              }}
            />
          </label>
        ))}
        <span style={{ fontSize: 11 }}>字（按字不按字节；勾选证据不计入）</span>
      </div>

      {saveAsOpen ? (
        <div style={{
          border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: 8,
          padding: 10,
          marginBottom: 10,
          background: 'var(--dsw-alias-bg-base)',
        }}>
          <div style={{ fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', marginBottom: 6 }}>
            复制当前这份 A/B/C/D 成一份新存档（文件名即存档名）。
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={saveAsName}
              onChange={(event) => setSaveAsName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void saveAsProfile(); }}
              placeholder="存档名"
              autoFocus
              style={{
                flex: '1 1 auto',
                height: 26,
                borderRadius: 6,
                border: '1px solid var(--dsw-alias-border-l1)',
                background: 'var(--dsw-alias-bg-layer-1)',
                color: 'var(--dsw-alias-label-primary)',
                fontSize: 12,
                padding: '0 8px',
              }}
            />
            <ProfileToolButton onClick={() => { void saveAsProfile(); }}>保存</ProfileToolButton>
            <ProfileToolButton onClick={() => { setSaveAsOpen(false); setSaveAsName(''); }}>取消</ProfileToolButton>
          </div>
        </div>
      ) : null}

      <input
        ref={importFileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(event) => { void pickImportFile(event); }}
      />
      {/* 自动发送开关暂时屏蔽：交互还有没定清楚的地方，后端能力保留（app-settings 接口照旧）。 */}
      {AUTO_SEND_SETTING_VISIBLE ? (
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        fontSize: 12,
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={autoSend}
          onChange={(event) => { void saveAutoSend(event.target.checked); }}
        />
        切换状态时自动发送默认输入（当前是只填入输入框、不发送；默认关闭）
      </label>
      ) : null}

      <div style={{
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 8,
        background: 'var(--dsw-alias-bg-base)',
        padding: '10px 12px',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {WORKFLOW_FLOW.map((item, index) => (
            <span key={item.state} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: NODE_STATE_COLOR[item.state],
                display: 'inline-block',
              }} />
              <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'nowrap' }}>{item.label}</span>
              {index < WORKFLOW_FLOW.length - 1 ? (
                <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginLeft: 2 }}>→</span>
              ) : null}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }}>
          返工（退回上一阶段）：实现中 → 讨论中；验收中 → 实现中 / 讨论中
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--dsw-alias-border-l1)', marginBottom: 12 }}>
        {[...STATE_TABS, APPENDIX_TAB].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--dsw-alias-brand-primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >{tab.label}</button>
        ))}
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 380,
        // 内置存档只读：输入框用 readOnly（仍能滚动、选中、复制），
        // 不能用 pointer-events:none 整块禁用——那样滚轮和文本选择都会一起失效。
      }}>
        {activeTab === 'appendix' ? (
          <AppendixPanel />
        ) : activeTab === 'shared' ? (
          <>
            <label style={LABEL_STYLE}>公共操作细节 · 三态通用</label>
            <textarea
              style={{ ...FIELD_STYLE, flex: '1 1 auto' }}
              readOnly={readOnlyProfile}
              value={detail.shared_detail ?? ''}
              onChange={(event) => update({ ...detail, shared_detail: event.target.value })}
            />
          </>
        ) : (
          <>
            <label style={LABEL_STYLE}>进入该状态后自动灌入输入框的默认文本（可空）</label>
            <textarea
              style={{ ...FIELD_STYLE, flex: '0 0 20%', resize: 'none' }}
              readOnly={readOnlyProfile}
              value={detail[activeTab]?.enter_trigger ?? ''}
              placeholder="留空则不自动灌入"
              onChange={(event) => patchTab(activeTab, { enter_trigger: event.target.value === '' ? null : event.target.value })}
            />
            <label style={{ ...LABEL_STYLE, marginTop: 10 }}>该状态的操作细节</label>
            <textarea
              style={{ ...FIELD_STYLE, flex: '1 1 auto', minHeight: 80 }}
              readOnly={readOnlyProfile}
              value={detail[activeTab]?.operation_detail ?? ''}
              onChange={(event) => patchTab(activeTab, { operation_detail: event.target.value })}
            />
            {activeTab === 'discussing' || activeTab === 'implementing' || activeTab === 'verifying' ? (
              <HardRulePanel
                state={activeTab}
                readOnly={readOnlyProfile}
                value={detail.hard_rules?.[activeTab] ?? DEFAULT_HARD_RULES[activeTab]}
                overridden={detail.hard_rules?.[activeTab] !== undefined}
                onChange={(next) => update({ ...detail, hard_rules: { ...(detail.hard_rules ?? {}), [activeTab]: next } })}
                onReset={() => {
                  const next = { ...(detail.hard_rules ?? {}) };
                  delete next[activeTab];
                  update({ ...detail, hard_rules: next });
                }}
              />
            ) : null}
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
          {status === 'pending' ? '待保存…'
            : status === 'saving' ? '保存中…'
              : status === 'saved' ? '已自动保存'
                : status === 'error' ? '' : '改动会自动保存'}
        </span>
        {error !== null ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }}>{error}</span> : null}
        <span style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={restoreFactoryDefaults}
            disabled={defaults === null || readOnlyProfile}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--dsw-alias-border-l1)',
              background: 'transparent',
              color: 'var(--dsw-alias-label-secondary)',
              cursor: defaults === null || readOnlyProfile ? 'not-allowed' : 'pointer',
              opacity: defaults === null || readOnlyProfile ? 0.6 : 1,
              fontSize: 12,
            }}
          >恢复出厂默认</button>
        </span>
      </div>
    </div>
  );
}

/** 设置左侧导航里的图标（与侧栏 workflow 工作区同一套树形图标）。 */
function WorkflowSectionIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <rect x="3" y="16" width="6" height="4" rx="1" />
      <rect x="15" y="16" width="6" height="4" rx="1" />
      <path d="M12 7v3" />
      <path d="M6 16v-1.6A1.4 1.4 0 0 1 7.4 13h9.2a1.4 1.4 0 0 1 1.4 1.4V16" />
    </svg>
  );
}

/** 把「操作细节」分区挂进 设置 → 左侧导航。 */
export function applyWorkflowSettingsSection(ctx: any) {
  const sectionId = 'dsh-agent-workflow';
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: sectionId,
        order: 50,
        label: 'Agent 工作流',
      },
      WorkflowGlobalSettingsSection,
    ),
  );
  ctx.slots.inject('settings.section.icon', () =>
    ctx.slots.register(
      { name: 'settings.section.icon', id: sectionId },
      WorkflowSectionIcon,
    ),
  );
}

/** 全局操作细节的独立弹窗版（与设置页共用同一个编辑组件）。 */
export function WorkflowSettingsDialog(props: { onClose: () => void }) {
  return (
    <Modal title="操作细节设置（全局）" onClose={props.onClose}>
      <WorkflowGlobalSettingsSection />
    </Modal>
  );
}

/** 通用二次确认弹窗：删除工作区等不可逆操作前先过一层。 */
export function WorkflowConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={props.title} onClose={props.onClose}>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary)', marginBottom: 16 }}>
        {props.message}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          onClick={props.onClose}
          style={{
            height: 28,
            padding: '0 14px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'transparent',
            color: 'var(--dsw-alias-label-primary)',
          }}
        >取消</button>
        <button
          type="button"
          onClick={props.onConfirm}
          style={{
            height: 28,
            padding: '0 14px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            // 不填充实色：某些主题没定义对应 token，实色 + #fff 会变成"白底白字"。
            border: '1px solid var(--dsw-alias-state-error-primary)',
            background: 'transparent',
            color: 'var(--dsw-alias-state-error-primary)',
          }}
        >{props.confirmLabel}</button>
      </div>
    </Modal>
  );
}

/** 节点补充说明弹窗：只编辑这个节点自己的附加说明，全局内容去设置里看。 */
export function WorkflowNodeDetailDialog(props: { workflowId: string; nodeId: string; onClose: () => void; onOpenSettings?: () => void }) {
  const { workflowId, nodeId, onClose, onOpenSettings } = props;
  const [payload, setPayload] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualData, setManualData] = useState<{ manual: string; notesDir: string; globalManual: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/dsh-agent-workflow/node-detail?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
        const responseBody = await response.json().catch(() => null);
        if (cancelled) return;
        if (responseBody?.ok === true) setPayload(responseBody);
        else setError(String(responseBody?.error ?? '读取失败'));
      } catch (reason) {
        if (!cancelled) setError(String(reason));
      }
    })();
    return () => { cancelled = true; };
  }, [workflowId, nodeId]);

  // 会话手册（方案/实施顺序） + 项目手册（总览/决策/要点）只读展示。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/dsh-agent-workflow/node-manual?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
        const responseBody = await response.json().catch(() => null);
        if (cancelled || responseBody?.ok !== true) return;
        setManualData(responseBody.manual === null
          ? null
          : {
              manual: String(responseBody.manual?.manual ?? ''),
              notesDir: String(responseBody.manual?.notesDir ?? ''),
              globalManual: String(responseBody.globalManual ?? ''),
            });
      } catch {
        // 读不到就不展示。
      }
    })();
    return () => { cancelled = true; };
  }, [workflowId, nodeId]);

  const currentState = payload?.node?.current_state ?? null;
  const labels: Record<string, string> = { discussing: '讨论中', implementing: '实现中', verifying: '验收中' };
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('detail');
  const timers = useRef<Record<string, any>>({});

  // 读到数据后把节点自己的附加说明灌进本地草稿。
  useEffect(() => {
    if (payload === null) return;
    setNotes({
      global: String(payload.additional?.global ?? ''),
      discussing: String(payload.additional?.discussing ?? ''),
      implementing: String(payload.additional?.implementing ?? ''),
      verifying: String(payload.additional?.verifying ?? ''),
    });
  }, [payload]);

  /** 附加说明：防抖 700ms 自动保存到该节点，不影响全局设置。 */
  const saveNote = (state: string, text: string) => {
    setNotes((current) => ({ ...current, [state]: text }));
    if (timers.current[state] !== undefined) clearTimeout(timers.current[state]);
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
      } catch (reason) {
        setNoteStatus(String(reason));
      }
    }, 700);
  };

  return (
    <Modal title={`节点补充说明 · ${payload?.node?.title ?? '节点'}`} onClose={onClose} fixedHeight={680}>
      {error !== null ? <div style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{error}</div> : null}
      {payload === null ? (
        <div style={{ color: 'var(--dsw-alias-label-secondary)' }}>加载中…</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>
              当前状态：{NODE_STATE_LABEL[currentState as keyof typeof NODE_STATE_LABEL] ?? currentState}
              {noteStatus === null ? '' : `　${noteStatus}`}
            </span>
            <button
              type="button"
              onClick={() => {
                // 先关掉当前弹窗，再让上层打开设置：避免两层遮罩叠在一起。
                onOpenSettings?.();
                onClose();
              }}
              style={TEXT_LINK_STYLE}
            >打开操作细节设置</button>
            {manualData !== null && manualData.notesDir !== '' ? (
              <button
                type="button"
                onClick={() => {
                  void fetch('/dsh-agent-workflow/open-folder', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ path: manualData.notesDir }),
                  });
                }}
                style={TEXT_LINK_STYLE}
              >打开文件夹</button>
            ) : null}
          </div>
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            background: 'var(--dsw-alias-bg-layer-1)',
            paddingBottom: 12,
          }}>
            <div style={{
              display: 'flex',
              gap: 4,
              padding: 4,
              background: 'var(--dsw-alias-bg-base)',
              border: '1px solid var(--dsw-alias-border-l1)',
              borderRadius: 9,
            }}>
              {NODE_DETAIL_TABS.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: '1 1 0',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: activeTab === tab.id ? 'var(--dsw-alias-brand-primary)' : 'transparent',
                    color: activeTab === tab.id ? 'var(--dsw-alias-bg-base)' : 'var(--dsw-alias-label-secondary)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: activeTab === tab.id ? 600 : 400,
                  }}
                >{tab.label}</button>
              ))}
            </div>
          </div>
          {activeTab === 'detail' ? (
            <>
              <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginBottom: 10 }}>
                全局的操作细节在「设置 → Agent 工作流」里；这里只写这个节点额外要注意的，会接在全局后面。
              </div>
              <div style={{
                border: '1px solid var(--dsw-alias-border-l1)',
                borderRadius: 8,
                padding: 10,
                marginBottom: 10,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>本节点附加（所有状态都会追加）</div>
                <textarea
                  style={{ ...FIELD_STYLE, minHeight: 52 }}
                  placeholder="留空则不追加"
                  value={notes.global ?? ''}
                  onChange={(event) => saveNote('global', event.target.value)}
                />
              </div>
              {(['discussing', 'implementing', 'verifying'] as const).map((state) => {
                return (
                  <div key={state} style={{
                    border: '1px solid var(--dsw-alias-border-l1)',
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 10,
                    background: currentState === state ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                      {labels[state]}
                      {currentState === state ? <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--dsw-alias-brand-primary)' }}>当前态</span> : null}
                    </div>
                    <textarea
                      style={{ ...FIELD_STYLE, minHeight: 52 }}
                      placeholder="留空则不追加"
                      value={notes[state] ?? ''}
                      onChange={(event) => saveNote(state, event.target.value)}
                    />
                  </div>
                );
              })}
              {payload?.node?.history !== undefined && payload.node.history.length > 0 ? (
                <div style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>状态时间线</div>
                  {payload.node.history.map((entry: any, index: number) => (
                    <div key={index} style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.7 }}>
                      {entry.at.slice(0, 16).replace('T', ' ')}　{NODE_STATE_LABEL[entry.from as keyof typeof NODE_STATE_LABEL] ?? entry.from} → {NODE_STATE_LABEL[entry.to as keyof typeof NODE_STATE_LABEL] ?? entry.to}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : activeTab === 'sessionManual' ? (
            <div style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>会话手册（方案 / 实施顺序，AI 自留，只读）</div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 380, overflow: 'auto', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
                {manualData === null ? '加载中…' : (manualData.manual.trim() !== '' ? manualData.manual : '（还没有内容）')}
              </div>
            </div>
          ) : (
            <div style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>项目手册（总览 / 决策 / 要点，AI 自留，只读）</div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 380, overflow: 'auto', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
                {manualData === null ? '加载中…' : (manualData.globalManual.trim() !== '' ? manualData.globalManual : '（还没有内容）')}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
