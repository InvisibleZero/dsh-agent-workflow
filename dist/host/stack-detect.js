// @ts-nocheck
/**
 * 宿主侧技术栈探测：读工作目录根的几个 marker 文件，交给纯规则 stackFromMarkers 判定。
 *
 * 放在 host 而不是 engine：读文件是副作用，engine 里的 stackFromMarkers 保持纯、可单测。
 */
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { stackFromMarkers } from '../engine/checkers/stack';
async function exists(file) {
    try {
        await access(file);
        return true;
    }
    catch {
        return false;
    }
}
/** 读工作目录根 marker，返回技术栈；目录为空 / 读不到返回 null。 */
export async function detectStack(workingDirectory) {
    if (typeof workingDirectory !== 'string' || workingDirectory === '')
        return null;
    const [pyproject, gomod, packageJson] = await Promise.all([
        exists(join(workingDirectory, 'pyproject.toml')),
        exists(join(workingDirectory, 'go.mod')),
        exists(join(workingDirectory, 'package.json')),
    ]);
    return stackFromMarkers({ pyproject, gomod, packageJson });
}
//# sourceMappingURL=stack-detect.js.map