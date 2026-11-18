import { describe, expect, it } from 'vitest';
import type { Stack } from '../src/engine/checkers/stack';
import type { CheckerTools } from '../src/engine/checkers/types';
import { contractChecker } from '../src/engine/checkers/contract';
import { boundaryChecker } from '../src/engine/checkers/boundary';
import { deadcodeChecker } from '../src/engine/checkers/deadcode';
import { depsChecker } from '../src/engine/checkers/deps';

const TOOLS: CheckerTools = { python: 'python3', lintImports: 'lint-imports', go: 'go', staticcheck: 'staticcheck' };

describe('驱动表：各检查器按栈选取证命令（用定位到的工具绝对路径）', () => {
  function cmdOf(checker: { buildCommands?: Record<string, (t: string, tools: CheckerTools) => string> }, stack: Stack): string {
    return checker.buildCommands?.[stack]?.('src', TOOLS) ?? '';
  }

  it('契约测试：js vitest / python pytest / go go test', () => {
    expect(cmdOf(contractChecker, 'js')).toContain('vitest');
    expect(cmdOf(contractChecker, 'python')).toContain('pytest');
    expect(cmdOf(contractChecker, 'go')).toContain('test');
  });

  it('依赖检查：js depcruise / python lint-imports / go build', () => {
    expect(cmdOf(depsChecker, 'js')).toContain('depcruise');
    expect(cmdOf(depsChecker, 'python')).toContain('lint-imports');
    expect(cmdOf(depsChecker, 'go')).toContain('build');
  });

  it('死代码：js knip / python vulture / go staticcheck', () => {
    expect(cmdOf(deadcodeChecker, 'js')).toContain('knip');
    expect(cmdOf(deadcodeChecker, 'python')).toContain('vulture');
    expect(cmdOf(deadcodeChecker, 'go')).toContain('staticcheck');
  });

  it('边界测试：js vitest / python pytest / go go test', () => {
    expect(cmdOf(boundaryChecker, 'js')).toContain('vitest');
    expect(cmdOf(boundaryChecker, 'python')).toContain('pytest');
    expect(cmdOf(boundaryChecker, 'go')).toContain('test');
  });

  it('命令里带的是定位到的工具绝对路径，不是裸命令名', () => {
    expect(cmdOf(contractChecker, 'python')).toContain('python3');
    expect(cmdOf(depsChecker, 'go')).toContain('"go"');
    expect(cmdOf(deadcodeChecker, 'go')).toContain('"staticcheck"');
  });

  it('四个检查器三栈命令都指向各自的证据文件', () => {
    expect(cmdOf(contractChecker, 'python')).toContain('contract.json');
    expect(cmdOf(depsChecker, 'go')).toContain('deps.json');
    expect(cmdOf(deadcodeChecker, 'python')).toContain('deadcode.json');
    expect(cmdOf(boundaryChecker, 'go')).toContain('boundary.json');
  });
});
