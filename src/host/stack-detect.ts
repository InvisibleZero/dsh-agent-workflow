// @ts-nocheck
/**
 * 宿主侧技术栈探测：从工作目录**向上**找 marker（pyproject.toml / package.json），
 * 交给纯规则 stackFromMarkers 判定。工作目录在项目子目录时，也能命中项目根的 marker。
 *
 * 放在 host 而不是 engine：读文件是副作用，engine 里的 stackFromMarkers 保持纯、可单测。
 */
import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { stackFromMarkers, type Stack } from '../engine/checkers/stack';

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export interface StackDetection {
  /** 探测到的技术栈；null = 一路向上都没有 marker。 */
  stack: Stack | null;
  /** 命中 marker 的项目根目录；null = 没命中。 */
  root: string | null;
}

/** 从工作目录向上逐级找 marker，返回技术栈 + 项目根。 */
export async function detectStack(workingDirectory: string): Promise<StackDetection> {
  if (typeof workingDirectory !== 'string' || workingDirectory === '') return { stack: null, root: null };
  let dir = resolve(workingDirectory);
  for (;;) {
    const [pyproject, packageJson] = await Promise.all([
      exists(join(dir, 'pyproject.toml')),
      exists(join(dir, 'package.json')),
    ]);
    const stack = stackFromMarkers({ pyproject, packageJson });
    if (stack !== null) return { stack, root: dir };
    const parent = dirname(dir);
    if (parent === dir) return { stack: null, root: null };
    dir = parent;
  }
}
