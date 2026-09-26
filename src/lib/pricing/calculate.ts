import type { AdvancedFeeResult, QuoteInput, QuoteResult } from './types';
import { roundQuote } from './rounding';

/**
 * 报价计算唯一实现（服务端与客户端共用，严禁另写第二份）。
 *
 * 语义要点：
 * - 实际汇率 = exchangeRate × (1 + exchangeMarkup)，境内运费同汇率换算
 * - 服务费 = max(采购成本 × serviceRate, minimumServiceFee)，有最低收费兜底
 * - 平台手续费是毛加价（gross-up）：很多平台从最终成交金额中抽成，
 *   所以 finalPrice = subtotal / (1 - platformFeeRate)，不是 subtotal × (1 + rate)
 * - platformFee 按取整后的实收报价计；profit = finalPrice - purchaseCost - platformFee
 * - 取整只作用于建议报价，中间金额保持全精度
 */
export function calculateQuote(input: QuoteInput): QuoteResult {
  const effectiveExchangeRate = input.exchangeRate * (1 + input.exchangeMarkup);
  const marketExchangeValue = input.foreignPrice * input.exchangeRate;

  const productCost = input.foreignPrice * effectiveExchangeRate;
  const domesticShippingCost = input.domesticShipping * effectiveExchangeRate;
  const basePurchaseCost = productCost + domesticShippingCost + input.additionalCost;
  let runningCost = basePurchaseCost;
  const advancedFeeBreakdown: AdvancedFeeResult[] = [];
  for (const step of input.advancedFees ?? []) {
    const rate = Number.isFinite(step.rate) ? Math.min(Math.max(step.rate, 0), 0.99) : 0;
    const actualAmount = Number.isFinite(step.actualAmount)
      ? Math.max(step.actualAmount ?? 0, 0)
      : null;
    const rateAmount = runningCost * rate;
    const amount = Math.max(rateAmount, actualAmount ?? 0);
    advancedFeeBreakdown.push({
      name: step.name.trim() || '自定义费用',
      baseAmount: runningCost,
      rate,
      rateAmount,
      actualAmount,
      amount,
    });
    runningCost += amount;
  }
  const advancedFeeTotal = runningCost - basePurchaseCost;
  const purchaseCost = runningCost;

  const serviceFee = Math.max(purchaseCost * input.serviceRate, input.minimumServiceFee);

  const subtotal = purchaseCost + serviceFee;
  const rawFinalPrice = subtotal / (1 - input.platformFeeRate);
  const finalPrice = roundQuote(rawFinalPrice, input.roundingMode);

  const platformFee = finalPrice * input.platformFeeRate;
  const profit = finalPrice - purchaseCost - platformFee;

  return {
    effectiveExchangeRate,
    marketExchangeValue,
    productCost,
    domesticShippingCost,
    basePurchaseCost,
    advancedFeeBreakdown,
    advancedFeeTotal,
    purchaseCost,
    serviceFee,
    subtotal,
    rawFinalPrice,
    finalPrice,
    platformFee,
    profit,
  };
}
