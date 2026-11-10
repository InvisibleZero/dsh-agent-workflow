// @ts-nocheck
/**
 * Workflow 工作区面板（浏览器半）。
 *
 * 形态：居中弹窗（`main[key=agent-workflow]`），入口是左侧导航项。
 * 列表项**就地展开**成嵌套子树：父节点 → 子节点 → 更深的子节点，逐级开合，
 * 不跳转页面。每个节点可以就地加子节点（宿主 /add-node）。
 *
 * 数据是一份全局列表（宿主半 /dsh-agent-workflow/list|create|get|add-node）。
 */

import { useCallback, useEffect, useState } from 'react';
import { NODE_STATE_LABEL } from '../schema/node-state-label';

interface WorkflowSummary {
  id: string;
  title: string;
  path: string | null;
  updatedAt: string;
}

const VEIL_STYLE = {
  minHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  boxSizing: 'border-box',
  background: 'rgba(0, 0, 0, 0.32)',
  color: 'inherit',
};

const DIALOG_STYLE = {
  width: 520,
  maxWidth: '100%',
  maxHeight: '80vh',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  borderRadius: 12,
  border: '1px solid var(--dsw-alias-border-l1, #ddd)',
  background: 'var(--dsw-alias-bg-layer-1, #1b1b1b)',
  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
  overflow: 'auto',
};

const HEADER_STYLE = { display: 'flex', alignItems: 'center', gap: 6 };

const TITLE_STYLE = {
  flex: 1,
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
  color: 'var(--dsw-alias-label-primary, inherit)',
};

const MUTED_STYLE = {
  fontSize: 12,
  lineHeight: 1.5,
  margin: 0,
  color: 'var(--dsw-alias-label-secondary, inherit)',
};

const TINY_STYLE = { fontSize: 11, color: 'var(--dsw-alias-label-secondary, inherit)' };

const ERROR_STYLE = { ...MUTED_STYLE, color: 'var(--dsw-alias-state-error-primary, #c62828)' };
const SUCCESS_STYLE = { ...MUTED_STYLE, color: 'var(--dsw-alias-state-success-primary, #2e7d32)' };

const BUTTON_STYLE = {
  height: 26,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-l1, #ddd)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary, inherit)',
  font: 'inherit',
  fontSize: 12,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  flexShrink: 0,
  cursor: 'pointer',
};

const ICON_BUTTON_STYLE = { ...BUTTON_STYLE, width: 26, padding: 0, border: 'none' };

const FIELD_STYLE = {
  boxSizing: 'border-box',
  width: '100%',
  height: 28,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-l1, #ddd)',
  background: 'var(--dsw-alias-bg-base, transparent)',
  color: 'inherit',
  font: 'inherit',
  fontSize: 12,
};

const ITEM_BASE = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return String(error);
}

function getService(ctx: any, name: string): any {
  if (ctx === undefined || ctx === null) return undefined;
  if (typeof ctx.get === 'function') {
    try {
      const viaGet = ctx.get(name);
      if (viaGet !== undefined && viaGet !== null) return viaGet;
    } catch {
      // 继续走属性访问
    }
  }
  try {
    return ctx[name];
  } catch {
    return undefined;
  }
}

async function apiGet(path: string): Promise<any> {
  const response = await fetch(path, { cache: 'no-store' });
  const json = await response.json().catch(() => null);
  if (!response.ok || json === null || json.ok !== true) throw new Error(json?.error ?? `HTTP ${response.status}`);
  return json;
}

async function apiPost(path: string, body: unknown): Promise<any> {
  const response = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json === null || json.ok !== true) throw new Error(json?.error ?? `HTTP ${response.status}`);
  return json;
}

/** 左侧导航项图标：外框与文字由宿主负责，这里只画图形。 */
export function WorkflowPanelIcon(props: { size?: number; active?: boolean }) {
  const size = props.size ?? 16;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'block', opacity: props.active ? 1 : 0.75 }}
    >
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="18" cy="12" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <path d="M8.4 7.3 15.6 11M8.4 16.7 15.6 13" />
    </svg>
  );
}

/** 树上的一个节点：自己可开合、可就地加子节点；子节点递归渲染。 */
function TreeNode(props: {
  node: any;
  byId: Map<string, any>;
  onAddNode: (parentId: string, title: string) => void;
  depth: number;
}) {
  const { node, byId, onAddNode, depth } = props;
  const [open, setOpen] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState('');

  const children = node.child_ids.map((id: string) => byId.get(id)).filter((child: any) => child !== undefined);

  const submit = () => {
    const title = draft.trim();
    if (title === '') return;
    onAddNode(node.node_id, title);
    setDraft('');
    setDrafting(false);
    setOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: depth * 14 }}>
        <button
          type="button"
          style={{ ...ICON_BUTTON_STYLE, width: 18, height: 20, fontSize: 11, opacity: children.length === 0 ? 0.35 : 1 }}
          onClick={() => setOpen((value) => !value)}
          disabled={children.length === 0}
          aria-label={open ? '收起' : '展开'}
        >
          {children.length === 0 ? '·' : open ? '▾' : '▸'}
        </button>
        <span style={{ fontSize: 12.5, color: 'var(--dsw-alias-label-primary, inherit)' }}>
          {node.title ?? node.node_type}
        </span>
        <span style={TINY_STYLE}>{NODE_STATE_LABEL[node.current_state] ?? node.current_state}</span>
        <button
          type="button"
          style={{ ...ICON_BUTTON_STYLE, width: 18, height: 20, fontSize: 11 }}
          title="加子节点"
          aria-label="加子节点"
          onClick={() => setDrafting(true)}
        >
          ＋
        </button>
      </div>

      {drafting ? (
        <div style={{ display: 'flex', gap: 6, paddingLeft: (depth + 1) * 14 }}>
          <input
            autoFocus
            value={draft}
            placeholder="子节点名称，回车创建"
            style={FIELD_STYLE}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
              if (event.key === 'Escape') setDrafting(false);
            }}
            onBlur={() => setDrafting(false)}
          />
        </div>
      ) : null}

      {open
        ? children.map((child: any) => (
            <TreeNode key={child.node_id} node={child} byId={byId} onAddNode={onAddNode} depth={depth + 1} />
          ))
        : null}
    </div>
  );
}

export function WorkflowPage(props: { ctx?: any }) {
  const [items, setItems] = useState<WorkflowSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [rootDrafting, setRootDrafting] = useState(false);
  const [rootDraft, setRootDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    try {
      const json = await apiGet('/dsh-agent-workflow/list');
      setItems(json.items ?? []);
    } catch (e) {
      setError(describeError(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const close = useCallback(() => {
    const layout = getService(props.ctx, 'layout');
    try {
      layout?.selectPanel?.('conversation');
    } catch (error_) {
      console.error('[dsh-agent-workflow] 关闭弹窗时切面板失败：', error_);
    }
  }, [props.ctx]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // 先收起展开的树，再关弹窗，避免一按就把整个面板关掉。
      if (expandedId !== null) {
        setExpandedId(null);
        setSnapshot(null);
        return;
      }
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, expandedId]);

  const loadSnapshot = useCallback(async (id: string) => {
    const json = await apiGet(`/dsh-agent-workflow/get?id=${encodeURIComponent(id)}`);
    setSnapshot(json.snapshot);
  }, []);

  const toggleExpand = async (item: WorkflowSummary) => {
    setError(null);
    if (expandedId === item.id) {
      setExpandedId(null);
      setSnapshot(null);
      return;
    }
    setExpandedId(item.id);
    setSnapshot(null);
    try {
      await loadSnapshot(item.id);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const addNode = async (parentId: string, title: string) => {
    if (expandedId === null) return;
    setError(null);
    try {
      const json = await apiPost('/dsh-agent-workflow/add-node', { id: expandedId, parentId, title });
      setSnapshot(json.snapshot);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const create = async () => {
    if (busy) return;
    const picker = getService(props.ctx, 'uiWorkspace');
    if (typeof picker?.pickDirectory !== 'function') {
      setError('宿主没有目录选择服务，暂时无法新建。');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      try {
        window.focus();
      } catch {
        // 某些环境 window.focus 不存在，忽略
      }
      const path = await picker.pickDirectory();
      if (typeof path !== 'string' || path === '') return; // 取消：静默
      const created = await apiPost('/dsh-agent-workflow/create', { path });
      await refresh();
      setNotice(`已新建「${created.workspace?.title ?? '工作区'}」。`);
      if (typeof created.workspace?.id === 'string') {
        setExpandedId(created.workspace.id);
        await loadSnapshot(created.workspace.id);
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const keyword = query.trim().toLowerCase();
  const visibleItems =
    keyword === ''
      ? items
      : items.filter(
          (item) => item.title.toLowerCase().includes(keyword) || (item.path ?? '').toLowerCase().includes(keyword),
        );

  const rootNode =
    snapshot === null ? undefined : snapshot.nodes.find((node: any) => node.node_id === snapshot.workspace_id);
  const byId = new Map<string, any>((snapshot?.nodes ?? []).map((node: any) => [node.node_id, node]));

  return (
    <div
      style={VEIL_STYLE}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div style={DIALOG_STYLE} role="dialog" aria-modal="true" aria-label="Workflow 工作区">
        <div style={HEADER_STYLE}>
          <strong style={TITLE_STYLE}>Workflow 工作区</strong>
          <button
            type="button"
            style={ICON_BUTTON_STYLE}
            title="搜索"
            aria-label="搜索"
            aria-pressed={searchOpen}
            onClick={() => {
              setSearchOpen((value) => !value);
              if (searchOpen) setQuery('');
            }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden style={{ display: 'block' }}>
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
          </button>
          <button type="button" style={ICON_BUTTON_STYLE} title="新建 workflow 工作区" aria-label="新建" onClick={create} disabled={busy}>
            {busy ? '…' : (
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden style={{ display: 'block' }}>
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
          </button>
          <button type="button" style={ICON_BUTTON_STYLE} title="关闭" aria-label="关闭" onClick={close}>
            ×
          </button>
        </div>

        {searchOpen ? (
          <input
            autoFocus
            value={query}
            placeholder="搜索 workflow 工作区"
            onChange={(event) => setQuery(event.target.value)}
            style={FIELD_STYLE}
          />
        ) : null}

        {error === null ? null : <p role="status" style={ERROR_STYLE}>{error}</p>}
        {notice === null ? null : <p role="status" style={SUCCESS_STYLE}>{notice}</p>}

        {visibleItems.length === 0 ? (
          <p style={MUTED_STYLE}>
            {items.length === 0 ? '还没有 workflow 工作区。点右上角「＋」，选一个文件夹开始。' : '没有匹配的 workflow 工作区。'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visibleItems.map((item) => {
              const isOpen = expandedId === item.id;
              return (
                <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      style={{ ...ICON_BUTTON_STYLE, width: 18 }}
                      onClick={() => void toggleExpand(item)}
                      aria-label={isOpen ? '收起' : '展开'}
                    >
                      {isOpen ? '▾' : '▸'}
                    </button>
                    <button type="button" style={ITEM_BASE} onClick={() => void toggleExpand(item)} title={item.path ?? ''}>
                      <span style={{ fontSize: 12.5, color: 'var(--dsw-alias-label-primary, inherit)' }}>{item.title}</span>
                      <span style={{ ...TINY_STYLE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.path ?? '（无目录）'}
                      </span>
                    </button>
                    {/* 收起时也显示「＋」：直接点它就展开并开始加子节点。 */}
                    <button
                      type="button"
                      style={{ ...ICON_BUTTON_STYLE, width: 20 }}
                      title="加一级子节点"
                      aria-label="加一级子节点"
                      onClick={() => {
                        void (async () => {
                          if (!isOpen) await toggleExpand(item);
                          setRootDrafting(true);
                        })();
                      }}
                    >
                      ＋
                    </button>
                  </div>

                  {isOpen ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 22 }}>
                      {rootDrafting && rootNode !== undefined ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            autoFocus
                            value={rootDraft}
                            placeholder="子节点名称，回车创建"
                            style={FIELD_STYLE}
                            onChange={(event) => setRootDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && rootDraft.trim() !== '') {
                                void addNode(rootNode.node_id, rootDraft);
                                setRootDraft('');
                                setRootDrafting(false);
                              }
                              if (event.key === 'Escape') setRootDrafting(false);
                            }}
                            onBlur={() => setRootDrafting(false)}
                          />
                        </div>
                      ) : null}

                      {snapshot === null ? (
                        <span style={TINY_STYLE}>读取中…</span>
                      ) : rootNode === undefined ? (
                        <span style={TINY_STYLE}>快照里没有根节点。</span>
                      ) : rootNode.child_ids.length === 0 ? (
                        <span style={TINY_STYLE}>还没有子节点，点右侧「＋」加一个。</span>
                      ) : (
                        rootNode.child_ids.map((childId: string) => {
                          const child = byId.get(childId);
                          if (child === undefined) return null;
                          return (
                            <TreeNode
                              key={childId}
                              node={child}
                              byId={byId}
                              onAddNode={(parentId, title) => void addNode(parentId, title)}
                              depth={0}
                            />
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
