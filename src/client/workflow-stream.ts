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
import { reportClientEvent } from './client-log';

/** 一帧推送：只告诉「哪个会话变了、为什么变」，客户端收到就重取一次。 */
export interface WorkflowStreamEvent {
  sessionId: string;
  /** released / created / state / pending / pending-cleared —— 只用于日志与分派。 */
  reason: string;
  /** 已知的新状态；没有就是 null（客户端自己重取）。 */
  state: string | null;
}

/** 只依赖 onmessage / onopen / onerror / close，方便测试替身。 */
export interface WorkflowStreamSource {
  onmessage: ((message: { data: string }) => void) | null;
  onopen?: (() => void) | null;
  onerror?: (() => void) | null;
  close(): void;
}

export interface WorkflowStream {
  /** 订阅；返回退订函数。首个订阅者会打开连接，最后一个退订会关闭。 */
  subscribe(listener: (event: WorkflowStreamEvent) => void): () => void;
}

/** 解析一帧；坏帧返回 null（不要因为一条脏数据把整个通道关掉）。 */
export function parseWorkflowStreamFrame(data: string): WorkflowStreamEvent | null {
  try {
    const parsed = JSON.parse(String(data ?? ''));
    if (typeof parsed?.sessionId !== 'string' || parsed.sessionId === '') return null;
    return {
      sessionId: parsed.sessionId,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      state: typeof parsed.state === 'string' && parsed.state !== '' ? parsed.state : null,
    };
  } catch {
    return null;
  }
}

/**
 * @param openSource 真正打开连接；返回 null 表示环境不支持（浏览器没有 EventSource）。
 * @param onStatus 连接状态变化回调：用来在浏览器侧留一条埋点，区分「没收到推送」和「收到了没渲染」。
 */
export function createWorkflowStream(
  openSource: () => WorkflowStreamSource | null,
  onStatus?: (open: boolean) => void,
): WorkflowStream {
  const listeners = new Set<(event: WorkflowStreamEvent) => void>();
  let source: WorkflowStreamSource | null = null;

  const notifyStatus = (open: boolean): void => {
    try {
      onStatus?.(open);
    } catch {
      // 状态回调只是埋点，失败不影响通道。
    }
  };

  const close = (): void => {
    try {
      source?.close();
    } catch {
      // 关连接失败没有补救动作，忽略。
    }
    source = null;
  };

  const open = (): void => {
    if (source !== null) return;
    let opened: WorkflowStreamSource | null = null;
    try {
      opened = openSource();
    } catch {
      opened = null;
    }
    if (opened === null) return;
    opened.onopen = () => {
      notifyStatus(true);
    };
    // EventSource 会自己重连；这里只把「断过」报出去，便于排查「界面没更新」。
    opened.onerror = () => {
      notifyStatus(false);
    };
    opened.onmessage = (message: { data: string }) => {
      const event = parseWorkflowStreamFrame(message.data);
      if (event === null) return;
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
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
        if (listeners.size === 0) close();
      };
    },
  };
}

let singleton: WorkflowStream | null = null;

/** 页面级单例：所有会话的徽标共用一条连接。 */
export function workflowStream(): WorkflowStream {
  if (singleton === null) {
    singleton = createWorkflowStream(
      () => {
        if (typeof EventSource === 'undefined') return null;
        return new EventSource('/dsh-agent-workflow/stream') as unknown as WorkflowStreamSource;
      },
      (open) => {
        // 连接状态是「界面为什么不更新」这条链路上的第一跳，必须能观测到。
        void reportClientEvent(open ? 'info' : 'warn', open ? 'stream open' : 'stream error');
      },
    );
  }
  return singleton;
}
