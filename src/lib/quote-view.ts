import type { QuoteInput, QuoteResult } from './pricing/types';

/**
 * 报价结果片段模板（双端共享）：服务端 /quote 返回它，客户端离线回退也渲染它。
 * 只依赖 QuoteResult / QuoteInput 纯数据，不碰 DOM 或 Node API。
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: 'JP¥', KRW: '₩',
  HKD: 'HK$', TWD: 'NT$', SGD: 'S$', AUD: 'A$', CAD: 'C$', PHP: '₱',
};

export function fmtMoney(value: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const n = value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${n}`;
}

export function buildCopyText(res: QuoteResult, input: QuoteInput): string {
  const c = input.settlementCurrency;
  const costLines = res.advancedFeeBreakdown.length
    ? [
        `基础采购成本：${fmtMoney(res.basePurchaseCost, c)}`,
        ...res.advancedFeeBreakdown.map((fee) => {
          const actual = fee.actualAmount === null ? '' : `，实额 ${fmtMoney(fee.actualAmount, c)}`;
          return `  ${fee.name}（计入金额取高；费率 ${(fee.rate * 100).toFixed(3)}%，估算 ${fmtMoney(fee.rateAmount, c)}${actual}）：${fmtMoney(fee.amount, c)}`;
        }),
        `资金链路费用小计：${fmtMoney(res.advancedFeeTotal, c)}`,
        `实际采购成本（含以上费用）：${fmtMoney(res.purchaseCost, c)}`,
      ]
    : [`实际采购成本：${fmtMoney(res.purchaseCost, c)}`];
  return [
    `建议报价：${fmtMoney(res.finalPrice, c)}`,
    `市场换算价：${fmtMoney(res.marketExchangeValue, c)}`,
    ...costLines,
    `服务费：${fmtMoney(res.serviceFee, c)}`,
    `平台手续费：${fmtMoney(res.platformFee, c)}`,
    `预计利润：${fmtMoney(res.profit, c)}`,
    `（1 ${input.fromCurrency} = ${res.effectiveExchangeRate.toFixed(6)} ${c}，含缓冲 ${(input.exchangeMarkup * 100).toFixed(1)}%）`,
  ].join('\n');
}

export function renderQuotePanel(res: QuoteResult, input: QuoteInput): string {
  const c = input.settlementCurrency;
  const copyAttr = encodeURIComponent(buildCopyText(res, input));
  const costRows = res.advancedFeeBreakdown.length
    ? `
    <div><dt>基础采购成本</dt><dd>${fmtMoney(res.basePurchaseCost, c)}</dd></div>
    ${res.advancedFeeBreakdown.map((fee) => {
      const actual = fee.actualAmount === null ? '' : `，实额 ${fmtMoney(fee.actualAmount, c)}`;
      const label = `${fee.name}（计入取高；${(fee.rate * 100).toFixed(3)}%，估算 ${fmtMoney(fee.rateAmount, c)}${actual}）`;
      return `<div><dt>${escapeHtml(label)}</dt><dd>${fmtMoney(fee.amount, c)}</dd></div>`;
    }).join('')}
    <div class="cost-subtotal"><dt>资金链路费用小计</dt><dd>${fmtMoney(res.advancedFeeTotal, c)}</dd></div>
    <div class="cost-total"><dt>实际采购成本（含以上费用）</dt><dd>${fmtMoney(res.purchaseCost, c)}</dd></div>`
    : `<div><dt>实际采购成本</dt><dd>${fmtMoney(res.purchaseCost, c)}</dd></div>`;

  return `
<div class="quote-panel" data-copy="${copyAttr}">
  <div class="rate-line">实际汇率 1 ${input.fromCurrency} = ${res.effectiveExchangeRate.toFixed(6)} ${c}（含缓冲 ${(input.exchangeMarkup * 100).toFixed(1)}%）</div>
  <dl class="quote-rows">
    <div><dt>市场换算价</dt><dd>${fmtMoney(res.marketExchangeValue, c)}</dd></div>
    ${costRows}
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}
