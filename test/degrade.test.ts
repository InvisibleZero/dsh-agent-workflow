import { describe, expect, it } from 'vitest';
import { hasMachineDriver } from '../src/engine/degrade';
import { contractChecker } from '../src/engine/checkers/contract';
import { boundaryChecker } from '../src/engine/checkers/boundary';
import { deadcodeChecker } from '../src/engine/checkers/deadcode';
import { depsChecker } from '../src/engine/checkers/deps';
import { regressionChecker } from '../src/engine/checkers/regression';
import { namingChecker } from '../src/engine/checkers/naming';
import { instrumentationChecker } from '../src/engine/checkers/instrumentation';
import { buildChecker } from '../src/engine/checkers/build';

describe('降级判定：给定栈有没有机器驱动', () => {
  it('buildCommands 型：js/python/go 都可验，null 降级', () => {
    for (const checker of [contractChecker, depsChecker, deadcodeChecker, boundaryChecker]) {
      expect(hasMachineDriver(checker, 'js')).toBe(true);
      expect(hasMachineDriver(checker, 'python')).toBe(true);
      expect(hasMachineDriver(checker, 'go')).toBe(true);
      expect(hasMachineDriver(checker, null)).toBe(false);
    }
  });

  it('仅 buildCommand 型（regression 的 autocannon）：语言无关，null 也可验', () => {
    expect(hasMachineDriver(regressionChecker, 'python')).toBe(true);
    expect(hasMachineDriver(regressionChecker, null)).toBe(true);
  });

  it('script 型（naming/instrumentation/build）：仅 js 可验，python/go/null 都降级', () => {
    for (const checker of [namingChecker, instrumentationChecker, buildChecker]) {
      expect(hasMachineDriver(checker, 'js')).toBe(true);
      expect(hasMachineDriver(checker, 'python')).toBe(false);
      expect(hasMachineDriver(checker, 'go')).toBe(false);
      expect(hasMachineDriver(checker, null)).toBe(false);
    }
  });
});
