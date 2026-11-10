// @ts-nocheck
/**
 * 侧栏工作区共享的 UI 原语（CSS 类解析 + 类型图标）。
 * 只依赖 react / ui-primitives / workspace-kind，不依赖 workspace-browser 或 workflow，
 * 供两个解耦模块各自 import。
 */
import { useEffect, useState } from 'react';
import { WorkspaceKind, workspaceKindIconKey } from './workspace-kind';
import { IconFolderCloseRegular, IconFolderOpenRegular } from '@deepseek-ai/dsh-client-ui-primitives';

/** 宿主 Rows 模块的 CSS Modules 哈希前缀（运行时反查，不硬编码）。 */
let rowsPrefixCache: string | null | undefined;

function rowsPrefix(): string | null {
  if (rowsPrefixCache !== undefined) return rowsPrefixCache;
  rowsPrefixCache = null;
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: any;
      try {
        rules = (sheet as any).cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules ?? [])) {
        const selector = (rule as any)?.selectorText;
        if (typeof selector !== 'string' || !selector.includes('_sessionRow')) continue;
        const matched = /\.([A-Za-z0-9]+)_sessionRow/.exec(selector);
        if (matched !== null) {
          rowsPrefixCache = matched[1];
          return rowsPrefixCache;
        }
      }
    }
  } catch {
    rowsPrefixCache = null;
  }
  return rowsPrefixCache;
}

export function rowsClass(name: string): string | undefined {
  const prefix = rowsPrefix();
  return prefix === null ? undefined : `${prefix}_${name}`;
}

export function joinClasses(...values: Array<string | false | null | undefined>): string | undefined {
  const kept = values.filter((value): value is string => typeof value === 'string' && value !== '');
  return kept.length === 0 ? undefined : kept.join(' ');
}

export interface FloatingMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface FloatingMenuPoint {
  x: number;
  y: number;
}

const FLOATING_MENU_WIDTH = 172;
const FLOATING_MENU_ITEM_HEIGHT = 30;

/**
 * 自绘下拉菜单：按触发按钮的位置固定定位。
 *
 * 为什么不用 ui-primitives 的 Menu：它在这个 DSH 版本里按 anchor 计算的位置会漂移
 * （工作区/节点越往下越明显），所以这里直接拿按钮的屏幕坐标自己摆，
 * 位置和点哪个按钮永远一致。
 */
export function FloatingMenu(props: {
  point: FloatingMenuPoint;
  items: FloatingMenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { point, items, onSelect, onClose } = props;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
  const menuHeight = items.length * FLOATING_MENU_ITEM_HEIGHT + 8;
  const left = Math.max(8, Math.min(point.x, viewportWidth - FLOATING_MENU_WIDTH - 8));
  const top = point.y + menuHeight > viewportHeight - 8
    ? Math.max(8, point.y - menuHeight - 32)
    : point.y;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        role="menu"
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'fixed',
          left,
          top,
          minWidth: FLOATING_MENU_WIDTH,
          padding: 4,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--dsw-alias-bg-overlay)',
          border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.36)',
        }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled === true}
            onClick={() => {
              onSelect(item.id);
              onClose();
            }}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId((current) => (current === item.id ? null : current))}
            style={{
              height: FLOATING_MENU_ITEM_HEIGHT,
              padding: '0 10px',
              display: 'flex',
              alignItems: 'center',
              border: 'none',
              borderRadius: 6,
              textAlign: 'left',
              fontSize: 13,
              color: 'var(--dsw-alias-label-primary)',
              background: hoveredId === item.id ? 'var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08))' : 'transparent',
              cursor: item.disabled === true ? 'default' : 'pointer',
              opacity: item.disabled === true ? 0.45 : 1,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 从点击事件里取触发按钮的屏幕坐标，给 FloatingMenu 用。 */
export function floatingMenuPointFromEvent(event: any): FloatingMenuPoint {
  const rect = event?.currentTarget?.getBoundingClientRect?.();
  if (rect === undefined || rect === null) return { x: 8, y: 8 };
  return { x: rect.left, y: rect.bottom + 4 };
}

/** 工作区类型图标：usual = 文件夹，workflow = 树结构（靠图标区分类型，标题不再加后缀）。 */
export function WorkspaceKindIcon(props: { kind: WorkspaceKind; size?: number; expanded?: boolean }) {
  const size = props.size ?? 16;
  if (workspaceKindIconKey(props.kind) === 'tree') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <rect x="3" y="16" width="6" height="4" rx="1" />
        <rect x="15" y="16" width="6" height="4" rx="1" />
        <path d="M12 7v3" />
        <path d="M6 16v-1.6A1.4 1.4 0 0 1 7.4 13h9.2a1.4 1.4 0 0 1 1.4 1.4V16" />
      </svg>
    );
  }
  return props.expanded === false
    ? <IconFolderCloseRegular size={size} />
    : <IconFolderOpenRegular size={size} />;
}
