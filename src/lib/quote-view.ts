import type { QuoteInput, QuoteResult } from './pricing/types';

/**
 * 报价结果片段模板（双端共享）：服务端 /quote 返回它，客户端离线回退也渲染它。
 * 只依赖 QuoteResult / QuoteInput 纯数据，不碰 DOM 或 Node API。
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: 'JP¥', KRW: '₩',
  HKD: 'HK$', TWD: 'NT$', SGD: 'S$', AUD: 'A$', CAD: 'C$',
};

export function fmtMoney(value: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const n = value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${n}`;
}

export function buildCopyText(res: QuoteResult, input: QuoteInput): string {
  const c = input.settlementCurrency;
  return [
    `建议报价：${fmtMoney(res.finalPrice, c)}`,
    `市场换算价：${fmtMoney(res.marketExchangeValue, c)}`,
    `实际采购成本：${fmtMoney(res.purchaseCost, c)}`,
    `服务费：${fmtMoney(res.serviceFee, c)}`,
    `平台手续费：${fmtMoney(res.platformFee, c)}`,
    `预计利润：${fmtMoney(res.profit, c)}`,
    `（1 ${input.fromCurrency} = ${res.effectiveExchangeRate.toFixed(6)} ${c}，含缓冲 ${(input.exchangeMarkup * 100).toFixed(1)}%）`,
  ].join('\n');
}

export function renderQuotePanel(res: QuoteResult, input: QuoteInput): string {
  const c = input.settlementCurrency;
  const copyAttr = encodeURIComponent(buildCopyText(res, input));

  return `
<div class="quote-panel" data-copy="${copyAttr}">
  <div class="rate-line">实际汇率 1 ${input.fromCurrency} = ${res.effectiveExchangeRate.toFixed(6)} ${c}（含缓冲 ${(input.exchangeMarkup * 100).toFixed(1)}%）</div>
  <dl class="quote-rows">
    <div><dt>市场换算价</dt><dd>${fmtMoney(res.marketExchangeValue, c)}</dd></div>
    <div><dt>实际采购成本</dt><dd>${fmtMoney(res.purchaseCost, c)}</dd></div>
    <div><dt>服务费</dt><dd>${fmtMoney(res.serviceFee, c)}</dd></div>
    <div><dt>平台手续费</dt><dd>${fmtMoney(res.platformFee, c)}</dd></div>
  </dl>
  <div class="quote-final">
    <div class="label">建议报价</div>
    <div class="amount">${fmtMoney(res.finalPrice, c)}</div>
  </div>
  <div class="profit-line">预计利润 <strong>${fmtMoney(res.profit, c)}</strong></div>
  <button type="button" class="copy-btn" data-copy-quote>复制报价</button>
</div>`;
}
