import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote } from '../calculate';
import { roundQuote } from '../rounding';
import type { QuoteInput } from '../types';

const approx = (actual: number, expected: number, msg?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg ?? 'value'}: actual=${actual}, expected≈${expected}`);

/** PRD 中的基准示例：1480 JPY、汇率 0.0432、缓冲 1.5%、服务费 5% 最低 ¥10、平台 5%、向上取整到 ¥1 */
const base: QuoteInput = {
  foreignPrice: 1480,
  fromCurrency: 'JPY',
  exchangeRate: 0.0432,
  exchangeMarkup: 0.015,
  domesticShipping: 0,
  additionalCost: 0,
  serviceRate: 0.05,
  minimumServiceFee: 10,
  platformFeeRate: 0.05,
  roundingMode: 'ceil1',
  settlementCurrency: 'CNY',
};

test('实际汇率 = 基础汇率 × (1 + 缓冲)', () => {
  const r = calculateQuote(base);
  approx(r.effectiveExchangeRate, 0.0432 * 1.015, 'effectiveExchangeRate');
});

test('市场换算价不含缓冲，采购成本含缓冲', () => {
  const r = calculateQuote(base);
  approx(r.marketExchangeValue, 63.936, 'marketExchangeValue');
  approx(r.productCost, 1480 * 0.0432 * 1.015, 'productCost');
});

test('基准示例：最低服务费兜底 + gross-up + 取整到 ¥1 → 建议报价 ¥79', () => {
  const r = calculateQuote(base);
  approx(r.purchaseCost, 64.89504, 'purchaseCost');
  approx(r.serviceFee, 10, 'serviceFee（5% 只有 ¥3.24，被最低 ¥10 兜底）');
  approx(r.subtotal, 74.89504, 'subtotal');
  approx(r.rawFinalPrice, 74.89504 / 0.95, 'rawFinalPrice');
  assert.equal(r.finalPrice, 79, 'finalPrice');
  approx(r.platformFee, 79 * 0.05, 'platformFee 按实收报价计');
  approx(r.profit, 79 - 64.89504 - 79 * 0.05, 'profit');
});

test('最低服务费兜底不误伤大额订单', () => {
  const r = calculateQuote({ ...base, minimumServiceFee: 0 });
  approx(r.serviceFee, 64.89504 * 0.05, 'serviceFee = purchaseCost × rate');
});

test('平台手续费是 gross-up：100/0.95 ≈ 105.26，而不是 ×1.05=105', () => {
  // 构造 subtotal = 100：purchaseCost 95 + serviceFee 5
  const r = calculateQuote({
    ...base,
    foreignPrice: 95 / (0.0432 * 1.015),
    exchangeRate: 0.0432,
    serviceRate: 0, minimumServiceFee: 5,
    additionalCost: 95 - (95 / (0.0432 * 1.015)) * 0.0432 * 1.015,
    roundingMode: 'none',
  });
  approx(r.subtotal, 100, 'subtotal');
  approx(r.rawFinalPrice, 100 / 0.95, 'rawFinalPrice = subtotal / (1 - rate)');
  assert.ok(r.rawFinalPrice > 105.26 && r.rawFinalPrice < 105.27, 'gross-up 大于 105');
  approx(r.platformFee, r.finalPrice * 0.05, 'platformFee');
});

test('境内运费按实际汇率（含缓冲）换算', () => {
  const r = calculateQuote({ ...base, domesticShipping: 500, minimumServiceFee: 0, roundingMode: 'none' });
  approx(r.domesticShippingCost, 500 * 0.043848, 'domesticShippingCost');
  approx(r.purchaseCost, 1480 * 0.043848 + 500 * 0.043848, 'purchaseCost');
});

test('其他成本（结算货币）直接计入采购成本', () => {
  const r = calculateQuote({ ...base, additionalCost: 3, minimumServiceFee: 0, roundingMode: 'none' });
  approx(r.purchaseCost, 64.89504 + 3, 'purchaseCost');
});

test('四档取整：73.26 → none/74/75/80', () => {
  assert.equal(roundQuote(73.26, 'none'), 73.26);
  assert.equal(roundQuote(73.26, 'ceil1'), 74);
  assert.equal(roundQuote(73.26, 'ceil5'), 75);
  assert.equal(roundQuote(73.26, 'ceil10'), 80);
});

test('取整不吃掉恰好整数的浮点尾差（78.0000000004 → 78 而非 79）', () => {
  assert.equal(roundQuote(78.0000000004, 'ceil1'), 78);
  assert.equal(roundQuote(75, 'ceil5'), 75);
});

test('结算货币不写死：同一数字换个 settlementCurrency 结果不变', () => {
  const usd = calculateQuote({ ...base, settlementCurrency: 'USD' });
  const cny = calculateQuote(base);
  approx(usd.finalPrice, cny.finalPrice, 'finalPrice');
  approx(usd.profit, cny.profit, 'profit');
});
