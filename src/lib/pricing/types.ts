/** 支持的币种。v1 结算货币默认 CNY，但结构上不写死 —— settlementCurrency 是显式参数。 */
export const SUPPORTED_CURRENCIES = [
  'JPY', 'USD', 'EUR', 'GBP', 'KRW', 'HKD', 'TWD', 'SGD', 'AUD', 'CAD', 'PHP', 'CNY',
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** 报价取整规则：不取整 / 向上到 ¥1 / ¥5 / ¥10 */
export type RoundingMode = 'none' | 'ceil1' | 'ceil5' | 'ceil10';

/** 高级模式中的成本型费用：逐项按当时累计成本估算。 */
export interface AdvancedFeeStep {
  name: string;
  /** 费率，小数：0.009 = 0.9% */
  rate: number;
  /** 可选的实际损耗金额；与费率估算取高，不叠加 */
  actualAmount?: number;
}

export interface AdvancedFeeResult {
  name: string;
  baseAmount: number;
  rate: number;
  rateAmount: number;
  actualAmount: number | null;
  amount: number;
}

export interface QuoteInput {
  /** 商品外币价格 */
  foreignPrice: number;
  fromCurrency: CurrencyCode;
  /** 基础汇率：1 fromCurrency = exchangeRate settlementCurrency */
  exchangeRate: number;
  /** 汇率安全加成（缓冲），小数：0.015 = 1.5% */
  exchangeMarkup: number;
  /** 购买国境内运费（外币计价） */
  domesticShipping: number;
  /** 其他实际成本（结算货币计价） */
  additionalCost: number;
  /** 服务费率，小数：0.05 = 5% */
  serviceRate: number;
  /** 最低服务费（结算货币计价），服务费兜底 */
  minimumServiceFee: number;
  /** 平台手续费率，小数：0.05 = 5%（从最终成交金额中扣除） */
  platformFeeRate: number;
  roundingMode: RoundingMode;
  /** 结算货币，默认 CNY 但不写死 */
  settlementCurrency: CurrencyCode;
  /** 高级模式额外成本步骤；未提供时结果与普通模式完全一致 */
  advancedFees?: AdvancedFeeStep[];
}

export interface QuoteResult {
  /** 实际使用汇率 = exchangeRate × (1 + exchangeMarkup) */
  effectiveExchangeRate: number;
  /** 市场换算价 = foreignPrice × exchangeRate（不含缓冲，仅展示对照） */
  marketExchangeValue: number;
  productCost: number;
  domesticShippingCost: number;
  /** 不含高级费用的基础采购成本 */
  basePurchaseCost: number;
  /** 高级费用步骤的逐项结果 */
  advancedFeeBreakdown: AdvancedFeeResult[];
  /** 高级费用合计 */
  advancedFeeTotal: number;
  /** 实际采购及资金链路成本，含高级费用 */
  purchaseCost: number;
  /** 服务费 = max(purchaseCost × serviceRate, minimumServiceFee) */
  serviceFee: number;
  /** subtotal = purchaseCost + serviceFee */
  subtotal: number;
  /** 取整前的理论报价 = subtotal / (1 - platformFeeRate) */
  rawFinalPrice: number;
  /** 建议报价（取整后，客户实际支付金额） */
  finalPrice: number;
  /** 平台手续费 = finalPrice × platformFeeRate（按实收金额计） */
  platformFee: number;
  /** 预计利润 = finalPrice - purchaseCost - platformFee */
  profit: number;
}
