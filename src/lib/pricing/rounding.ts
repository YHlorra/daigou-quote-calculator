import type { RoundingMode } from './types';

/** 消掉浮点尾差（0.1+0.2 类），避免 78.0000000004 被错误进位到 79 */
function clean(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * 最终报价取整。只对建议报价（finalPrice）生效，中间金额保持全精度。
 * -1e-9 容差处理「恰好落在整数上」的浮点表示。
 */
export function roundQuote(value: number, mode: RoundingMode): number {
  const v = clean(value);
  switch (mode) {
    case 'ceil1':
      return Math.ceil(v - 1e-9);
    case 'ceil5':
      return Math.ceil((v - 1e-9) / 5) * 5;
    case 'ceil10':
      return Math.ceil((v - 1e-9) / 10) * 10;
    case 'none':
    default:
      return v;
  }
}
