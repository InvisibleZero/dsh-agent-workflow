import { describe, expect, it } from 'vitest';
import type { Stack } from '../src/engine/checkers/stack';
import type { CheckerTools } from '../src/engine/checkers/types';
import { contractChecker } from '../src/engine/checkers/contract';
import { boundaryChecker } from '../src/engine/checkers/boundary';
import { deadcodeChecker } from '../src/engine/checkers/deadcode';
import { depsChecker } from '../src/engine/checkers/deps';

const TOOLS: CheckerTools = { python: 'python3', lintImports: 'lint-imports' };

describe('驱动表：各检查器按栈选取证命令（用定位到的工具绝对路径）', () => {
  function cmdOf(checker: { buildCommands?: Record<string, (t: string, tools: CheckerTools) => string> }, stack: Stack): string {
    return checker.buildCommands?.[stack]?.('src', TOOLS) ?? '';
  }

  it('契约测试：js vitest / python pytest', () => {
    expect(cmdOf(contractChecker, 'js')).toContain('vitest');
    expect(cmdOf(contractChecker, 'python')).toContain('pytest');
  });

  it('依赖检查：js depcruise / python lint-imports', () => {
    expect(cmdOf(depsChecker, 'js')).toContain('depcruise');
    expect(cmdOf(depsChecker, 'python')).toContain('lint-imports');
  });

  it('死代码：js knip / python vulture', () => {
    expect(cmdOf(deadcodeChecker, 'js')).toContain('knip');
    expect(cmdOf(deadcodeChecker, 'python')).toContain('vulture');
  });

  it('边界测试：js vitest / python pytest', () => {
    expect(cmdOf(boundaryChecker, 'js')).toContain('vitest');
    expect(cmdOf(boundaryChecker, 'python')).toContain('pytest');
  });

  it('命令里带的是定位到的工具绝对路径，不是裸命令名', () => {
    expect(cmdOf(contractChecker, 'python')).toContain('python3');
    expect(cmdOf(depsChecker, 'python')).toContain('"lint-imports"');
  });

  it('四个检查器两栈命令都指向各自的证据文件', () => {
    expect(cmdOf(contractChecker, 'python')).toContain('contract.json');
    expect(cmdOf(depsChecker, 'js')).toContain('deps.json');
    expect(cmdOf(deadcodeChecker, 'python')).toContain('deadcode.json');
    expect(cmdOf(boundaryChecker, 'js')).toContain('boundary.json');
  });
});
