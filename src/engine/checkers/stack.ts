/**
 * 技术栈探测的纯规则：根目录 marker → 技术栈。
 *
 * 判定口径（讨论定稿）：根目录语言为准，优先级 pyproject.toml > go.mod > package.json。
 * 这里只做纯判定、可单测；读文件（marker 到底存不存在）在宿主层做，见 host/stack-detect。
 */

export type Stack = 'js' | 'python' | 'go';

export interface StackMarkers {
  pyproject: boolean;
  gomod: boolean;
  packageJson: boolean;
}

/** 根目录 marker → 技术栈；一个 marker 都没有返回 null（调用方降级为 AI 证据）。 */
export function stackFromMarkers(markers: StackMarkers): Stack | null {
  if (markers.pyproject) return 'python';
  if (markers.gomod) return 'go';
  if (markers.packageJson) return 'js';
  return null;
}
