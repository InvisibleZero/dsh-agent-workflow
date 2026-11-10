// @ts-nocheck
/**
 * workflow 的界面块：
 * - 设置页里的「操作细节」分区（应用级全局 A + B/C/D，四个页签）；
 * - 节点操作细节弹窗（只读展示该节点生效的 A + B/C/D，标出覆盖项）。
 *
 * 样式全部用主题变量内联，深浅色自动跟随，不依赖 CSS Module。
 */
import { useEffect, useState } from 'react';

const LABEL_STYLE = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4, display: 'block' } as const;

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

function Button(props: { label: string; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={props.disabled === true}
      onClick={props.onClick}
      style={{
        height: 28,
        padding: '0 14px',
        borderRadius: 6,
        cursor: props.disabled === true ? 'default' : 'pointer',
        fontSize: 12,
        opacity: props.disabled === true ? 0.6 : 1,
        border: props.primary === true ? 'none' : '1px solid var(--dsw-alias-border-l1)',
        background: props.primary === true ? 'var(--dsw-alias-brand-primary)' : 'transparent',
        color: props.primary === true ? '#fff' : 'var(--dsw-alias-label-primary)',
      }}
    >{props.label}</button>
  );
}

function Modal(props: { title: string; onClose: () => void; children: any }) {
  return (
    <>
      <div style={OVERLAY_STYLE} onClick={props.onClose} />
      <div style={PANEL_STYLE} role="dialog" aria-label={props.title}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <strong style={{ fontSize: 14 }}>{props.title}</strong>
          <button
            type="button"
            aria-label="关闭"
            onClick={props.onClose}
            style={{ border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >×</button>
        </div>
        {props.children}
      </div>
    </>
  );
}

const STATE_TABS = [
  { id: 'shared', label: '公共（A）' },
  { id: 'discussing', label: '讨论中（B）' },
  { id: 'implementing', label: '实现中（C）' },
  { id: 'verifying', label: '验收中（D）' },
];

/**
 * 设置页里的「操作细节」分区内容。
 * A/B/C/D 四个页签横向排开；每个状态页签内：默认输入在上（20%），操作细节在下（80%）。
 */
export function WorkflowGlobalSettingsSection() {
  const [detail, setDetail] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('shared');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/dsh-agent-workflow/global-settings');
        const data = await response.json().catch(() => null);
        if (cancelled) return;
        if (data?.ok === true) setDetail(data.globalOperationDetail);
        else setError(String(data?.error ?? '读取设置失败'));
      } catch (reason) {
        if (!cancelled) setError(String(reason));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    if (detail === null) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/dsh-agent-workflow/global-settings-save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ globalOperationDetail: detail }),
      });
      const data = await response.json().catch(() => null);
      if (data?.ok === true) {
        setDetail(data.globalOperationDetail);
        setMessage('已保存');
      } else {
        setError(String(data?.error ?? '保存失败'));
      }
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  if (detail === null) {
    return <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>{error ?? '加载中…'}</div>;
  }

  const patchTab = (tabId: string, patch: any) => setDetail({ ...detail, [tabId]: { ...detail[tabId], ...patch } });

  return (
    <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-primary)' }}>
      <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginBottom: 12 }}>
        这些操作细节是**应用级全局**的，所有 workflow 节点在对应状态下都会读到；节点可以单独覆盖自己当前状态那一条。
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--dsw-alias-border-l1)', marginBottom: 12 }}>
        {STATE_TABS.map((tab) => (
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

      <div style={{ display: 'flex', flexDirection: 'column', height: 380 }}>
        {activeTab === 'shared' ? (
          <>
            <label style={LABEL_STYLE}>公共操作细节（A）· 三态通用</label>
            <textarea
              style={{ ...FIELD_STYLE, flex: '1 1 auto' }}
              value={detail.shared_detail ?? ''}
              onChange={(event) => setDetail({ ...detail, shared_detail: event.target.value })}
            />
          </>
        ) : (
          <>
            <label style={LABEL_STYLE}>进入该状态后自动灌入输入框的默认文本（20%，可空）</label>
            <input
              style={{ ...FIELD_STYLE, flex: '0 0 20%' }}
              value={detail[activeTab]?.enter_trigger ?? ''}
              placeholder="留空则不自动灌入"
              onChange={(event) => patchTab(activeTab, { enter_trigger: event.target.value === '' ? null : event.target.value })}
            />
            <label style={{ ...LABEL_STYLE, marginTop: 10 }}>该状态的操作细节（80%）</label>
            <textarea
              style={{ ...FIELD_STYLE, flex: '1 1 80%' }}
              value={detail[activeTab]?.operation_detail ?? ''}
              onChange={(event) => patchTab(activeTab, { operation_detail: event.target.value })}
            />
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <Button label={saving ? '保存中…' : '保存'} onClick={() => void save()} primary disabled={saving} />
        {message !== null ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-state-success-primary)' }}>{message}</span> : null}
        {error !== null ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }}>{error}</span> : null}
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

/** 节点操作细节弹窗：展示该节点当前生效的 A + B/C/D，并标出节点自己覆盖的条目。 */
export function WorkflowNodeDetailDialog(props: { workflowId: string; nodeId: string; onClose: () => void }) {
  const { workflowId, nodeId, onClose } = props;
  const [payload, setPayload] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/dsh-agent-workflow/node-detail?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
        const data = await response.json().catch(() => null);
        if (cancelled) return;
        if (data?.ok === true) setPayload(data);
        else setError(String(data?.error ?? '读取失败'));
      } catch (reason) {
        if (!cancelled) setError(String(reason));
      }
    })();
    return () => { cancelled = true; };
  }, [workflowId, nodeId]);

  const overrides = payload?.overrides ?? null;
  const currentState = payload?.node?.current_state ?? null;
  const labels: Record<string, string> = { discussing: '讨论中（B）', implementing: '实现中（C）', verifying: '验收中（D）' };

  return (
    <Modal title={`操作细节 · ${payload?.node?.title ?? '节点'}`} onClose={onClose}>
      {error !== null ? <div style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{error}</div> : null}
      {payload === null ? (
        <div style={{ color: 'var(--dsw-alias-label-secondary)' }}>加载中…</div>
      ) : (
        <>
          <div style={{ color: 'var(--dsw-alias-label-secondary)', marginBottom: 10 }}>
            当前状态：{currentState}
            {overrides !== null ? '（该节点有覆盖项，标注为「已覆盖」）' : '（沿用全局设置）'}
          </div>
          <div style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>公共操作细节（A）</div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{payload.global.shared_detail}</div>
          </div>
          {(['discussing', 'implementing', 'verifying'] as const).map((state) => {
            const global = payload.global[state];
            const override = overrides?.[state];
            const shown = override ?? global;
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
                  {override !== undefined ? <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--dsw-alias-state-warn-primary)' }}>已覆盖</span> : null}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{shown.operation_detail}</div>
                {shown.enter_trigger !== null && shown.enter_trigger !== '' ? (
                  <div style={{ marginTop: 6, color: 'var(--dsw-alias-label-secondary)' }}>
                    进入后默认输入：{shown.enter_trigger}
                  </div>
                ) : null}
              </div>
            );
          })}
        </>
      )}
    </Modal>
  );
}
