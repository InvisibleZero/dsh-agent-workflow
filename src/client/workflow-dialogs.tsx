// @ts-nocheck
/**
 * workflow 的两个弹窗：
 * - 全局操作细节（A 公共 + B/C/D 三态），每个 workflow 工作区各一份，存在快照的 settings 里；
 * - 节点操作细节（只读展示 A + B/C/D，并标出该节点覆盖了哪一条）。
 *
 * 样式全部用主题变量内联，不依赖 CSS Module，深浅色自动跟随。
 */
import { useEffect, useState } from 'react';

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

const OVERLAY_STYLE = {
  position: 'fixed',
  inset: 0,
  zIndex: 1199,
  background: 'rgba(0,0,0,.45)',
} as const;

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

function Modal(props: { title: string; onClose: () => void; children: any; footer?: any }) {
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
        {props.footer === undefined ? null : <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>{props.footer}</div>}
      </div>
    </>
  );
}

function Button(props: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        height: 28,
        padding: '0 14px',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
        border: props.primary === true ? 'none' : '1px solid var(--dsw-alias-border-l1)',
        background: props.primary === true ? 'var(--dsw-alias-brand-primary)' : 'transparent',
        color: props.primary === true ? '#fff' : 'var(--dsw-alias-label-primary)',
      }}
    >{props.label}</button>
  );
}

function StateDetailFields(props: {
  title: string;
  detail: { operation_detail: string; enter_trigger: string | null };
  onChange: (next: { operation_detail: string; enter_trigger: string | null }) => void;
  highlight?: boolean;
}) {
  const { title, detail, onChange, highlight } = props;
  return (
    <div style={{
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 8,
      padding: 10,
      marginBottom: 10,
      background: highlight === true ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        {title}
        {highlight === true ? <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--dsw-alias-brand-primary)' }}>当前态</span> : null}
      </div>
      <label style={LABEL_STYLE}>操作细节</label>
      <textarea
        style={{ ...FIELD_STYLE, minHeight: 54 }}
        value={detail.operation_detail}
        onChange={(event) => onChange({ ...detail, operation_detail: event.target.value })}
      />
      <label style={{ ...LABEL_STYLE, marginTop: 8 }}>进入后默认输入（可空）</label>
      <input
        style={FIELD_STYLE}
        value={detail.enter_trigger ?? ''}
        placeholder="留空则不自动灌入输入框"
        onChange={(event) => onChange({ ...detail, enter_trigger: event.target.value === '' ? null : event.target.value })}
      />
    </div>
  );
}

/** 全局操作细节（A + B/C/D）编辑弹窗：按 workflow 保存到该快照的 settings。 */
export function WorkflowSettingsDialog(props: { workflowId: string; onClose: () => void }) {
  const { workflowId, onClose } = props;
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/dsh-agent-workflow/settings?id=${encodeURIComponent(workflowId)}`);
        const data = await response.json().catch(() => null);
        if (cancelled) return;
        if (data?.ok === true) setDetail(data.globalOperationDetail);
        else setError(String(data?.error ?? '读取设置失败'));
      } catch (reason) {
        if (!cancelled) setError(String(reason));
      }
    })();
    return () => { cancelled = true; };
  }, [workflowId]);

  const save = async () => {
    if (detail === null) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/dsh-agent-workflow/settings-save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: workflowId, globalOperationDetail: detail }),
      });
      const data = await response.json().catch(() => null);
      if (data?.ok === true) onClose();
      else setError(String(data?.error ?? '保存失败'));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="操作细节设置（全局）"
      onClose={onClose}
      footer={(
        <>
          <Button label="取消" onClick={onClose} />
          <Button label={saving ? '保存中…' : '保存'} onClick={() => void save()} primary />
        </>
      )}
    >
      {error !== null ? <div style={{ color: 'var(--dsw-alias-state-error-primary)', marginBottom: 8 }}>{error}</div> : null}
      {detail === null ? (
        <div style={{ color: 'var(--dsw-alias-label-secondary)' }}>加载中…</div>
      ) : (
        <>
          <div style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>公共操作细节（A）</div>
            <label style={LABEL_STYLE}>三态通用，每个节点都会读到</label>
            <textarea
              style={{ ...FIELD_STYLE, minHeight: 54 }}
              value={detail.shared_detail ?? ''}
              onChange={(event) => setDetail({ ...detail, shared_detail: event.target.value })}
            />
          </div>
          <StateDetailFields title="讨论中（B）" detail={detail.discussing} onChange={(next) => setDetail({ ...detail, discussing: next })} />
          <StateDetailFields title="实现中（C）" detail={detail.implementing} onChange={(next) => setDetail({ ...detail, implementing: next })} />
          <StateDetailFields title="验收中（D）" detail={detail.verifying} onChange={(next) => setDetail({ ...detail, verifying: next })} />
        </>
      )}
    </Modal>
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
