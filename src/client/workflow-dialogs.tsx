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
  { id: 'shared', label: '公共' },
  { id: 'discussing', label: '讨论中' },
  { id: 'implementing', label: '实现中' },
  { id: 'verifying', label: '验收中' },
];

/**
 * 设置页里的「操作细节」分区内容。
 * A/B/C/D 四个页签横向排开；每个状态页签内：默认输入在上（20%），操作细节在下（80%）。
 */
export function WorkflowGlobalSettingsSection() {
  const [detail, setDetail] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('shared');
  const [status, setStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<any>(null);
  const latestRef = useRef<any>(null);

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

  /** 真正落盘：只由防抖计时器或卸载时的兜底调用。 */
  const persist = async (value: any) => {
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
      } else {
        setStatus('error');
        setError(String(data?.error ?? '保存失败'));
      }
    } catch (reason) {
      setStatus('error');
      setError(String(reason));
    }
  };

  /** 改动即排一次防抖保存（700ms），不需要「保存」按钮。 */
  const update = (next: any) => {
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
            <label style={LABEL_STYLE}>公共操作细节 · 三态通用</label>
            <textarea
              style={{ ...FIELD_STYLE, flex: '1 1 auto' }}
              value={detail.shared_detail ?? ''}
              onChange={(event) => update({ ...detail, shared_detail: event.target.value })}
            />
          </>
        ) : (
          <>
            <label style={LABEL_STYLE}>进入该状态后自动灌入输入框的默认文本（可空）</label>
            <textarea
              style={{ ...FIELD_STYLE, flex: '0 0 20%', resize: 'none' }}
              value={detail[activeTab]?.enter_trigger ?? ''}
              placeholder="留空则不自动灌入"
              onChange={(event) => patchTab(activeTab, { enter_trigger: event.target.value === '' ? null : event.target.value })}
            />
            <label style={{ ...LABEL_STYLE, marginTop: 10 }}>该状态的操作细节</label>
            <textarea
              style={{ ...FIELD_STYLE, flex: '1 1 80%' }}
              value={detail[activeTab]?.operation_detail ?? ''}
              onChange={(event) => patchTab(activeTab, { operation_detail: event.target.value })}
            />
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
            border: 'none',
            background: 'var(--dsw-alias-state-error-primary, #d64545)',
            color: '#fff',
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
  const [manualData, setManualData] = useState<{ manual: string; summary: string; notesDir: string; parentSummary: string } | null>(null);

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

  // 工作手册 / 摘要只读展示（AI 自留记录，人只读）。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/dsh-agent-workflow/node-manual?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
        const data = await response.json().catch(() => null);
        if (cancelled || data?.ok !== true) return;
        setManualData(data.manual === null
          ? null
          : {
              manual: String(data.manual?.manual ?? ''),
              summary: String(data.manual?.summary ?? ''),
              notesDir: String(data.manual?.notesDir ?? ''),
              parentSummary: String(data.parentSummary ?? ''),
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
        const data = await response.json().catch(() => null);
        setNoteStatus(data?.ok === true ? '已保存' : String(data?.error ?? '保存失败'));
      } catch (reason) {
        setNoteStatus(String(reason));
      }
    }, 700);
  };

  return (
    <Modal title={`节点补充说明 · ${payload?.node?.title ?? '节点'}`} onClose={onClose}>
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
              style={{
                height: 24,
                padding: '0 10px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                border: '1px solid var(--dsw-alias-border-l1)',
                background: 'transparent',
                color: 'var(--dsw-alias-brand-primary)',
              }}
            >打开操作细节设置 →</button>
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
                style={{
                  height: 24,
                  padding: '0 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  border: '1px solid var(--dsw-alias-border-l1)',
                  background: 'transparent',
                  color: 'var(--dsw-alias-label-primary)',
                }}
              >打开文件夹</button>
            ) : null}
          </div>
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
          {manualData !== null ? (
            <div style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>工作手册（AI 自留，只读）</div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 180, overflow: 'auto', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
                {manualData.manual.trim() !== '' ? manualData.manual : '（还没有内容）'}
              </div>
              {manualData.parentSummary.trim() !== '' ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>上级手册摘要（仅一层）</div>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 120, overflow: 'auto', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
                    {manualData.parentSummary}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
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
        </>
      )}
    </Modal>
  );
}
