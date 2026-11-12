/**
 * 浏览器半的埋点出口。
 *
 * 为什么要这条通道：宿主的事件环只能证明「服务端做了/没做」，证明不了
 * 「页面拿到节点之后有没有渲染」。这次排查「切到工作流没 UI」时，就卡在
 * 这一跳分不清——是没收到、还是收到了没画出来。所以把浏览器侧的关键跳
 * 发回宿主，和宿主事件落进同一个环，两边能对上时间。
 *
 * 只报「状态变化」，不报每一帧；宿主侧还有速率上限兜底。
 */
export async function reportClientEvent(level: 'info' | 'warn', message: string): Promise<void> {
  try {
    await fetch('/dsh-agent-workflow/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level, message }),
    });
  } catch {
    // 打点失败不能影响功能：静默丢弃。
  }
}
