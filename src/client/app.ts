import { calculateQuote } from '../lib/pricing/calculate';
import {
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
  type QuoteInput,
  type RoundingMode,
} from '../lib/pricing/types';
import { buildCopyText, renderQuotePanel } from '../lib/quote-view';
import { fetchRateSnapshot } from './rate';

/**
 * 客户端入口（esbuild 打包为 public/app.js，IIFE，纯静态部署零后端）。
 * 职责：输入即本地实时计算（同一份定价模块）、presets 与状态持久化（localStorage）、
 * 汇率快照获取与回退、复制报价、SW 注册。
 * 计算与结果渲染直接 import 共享模块，禁止在这里复写公式。
 */

const STORAGE_KEY = 'proxy-calc-v1';
const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el as T;
};

const form = $<HTMLFormElement>('#calc-form');
const resultPanel = $('#result-panel');
const rateMeta = $('#rate-meta');

interface FieldValues {
  foreignPrice: string;
  exchangeRate: string;
  domesticShipping: string;
  additionalCost: string;
  serviceRatePct: string;
  minimumServiceFee: string;
  platformFeeRatePct: string;
  exchangeMarkupPct: string;
  roundingMode: string;
}

const FIELD_IDS = Object.keys({
  foreignPrice: 1, exchangeRate: 1, domesticShipping: 1, additionalCost: 1,
  serviceRatePct: 1, minimumServiceFee: 1, platformFeeRatePct: 1,
  exchangeMarkupPct: 1, roundingMode: 1,
}) as (keyof FieldValues)[];

interface StoredState {
  fields: Partial<FieldValues>;
  fromCurrency: CurrencyCode;
  lastRate?: { from: string; to: string; rate: number; timestamp: number; source: string };
  presets: Record<string, Partial<FieldValues>>;
  presetName?: string;
}

function readState(): StoredState {
  try {
    return { fields: {}, fromCurrency: 'JPY', presets: {}, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return { fields: {}, fromCurrency: 'JPY', presets: {} };
  }
}

function writeState(patch: Partial<StoredState>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readState(), ...patch }));
  } catch {
    // 部分内嵌浏览器 / 隐私模式禁用 localStorage：不持久化，不影响计算
  }
}

function readFields(): FieldValues {
  const out = {} as FieldValues;
  for (const key of FIELD_IDS) {
    out[key] = (form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
  }
  return out;
}

function applyFields(fields: Partial<FieldValues>): void {
  for (const [key, value] of Object.entries(fields)) {
    const el = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null;
    if (el && value != null) el.value = String(value);
  }
}

function collectInput(): QuoteInput | null {
  const fields = readFields();
  const foreignPrice = Number(fields.foreignPrice);
  const exchangeRate = Number(fields.exchangeRate);
  if (!(foreignPrice > 0) || !(exchangeRate > 0)) return null;
  const roundingMode = fields.roundingMode as RoundingMode;
  const pct = (v: string) => Math.min(Math.max(Number(v) || 0, 0), 100) / 100;
  return {
    foreignPrice,
    fromCurrency: $<HTMLSelectElement>('#fromCurrency').value as CurrencyCode,
    exchangeRate,
    exchangeMarkup: pct(fields.exchangeMarkupPct),
    domesticShipping: Math.max(0, Number(fields.domesticShipping) || 0),
    additionalCost: Math.max(0, Number(fields.additionalCost) || 0),
    serviceRate: pct(fields.serviceRatePct),
    minimumServiceFee: Math.max(0, Number(fields.minimumServiceFee) || 0),
    platformFeeRate: Math.min(pct(fields.platformFeeRatePct), 0.9),
    roundingMode: ['none', 'ceil1', 'ceil5', 'ceil10'].includes(roundingMode) ? roundingMode : 'ceil1',
    settlementCurrency: 'CNY',
  };
}

/* ---------- 实时计算：输入即本地算（同一份公式模块，无网络往返，离线可用） ---------- */

function renderLocalQuote(): void {
  const input = collectInput();
  if (!input) return;
  resultPanel.innerHTML = renderQuotePanel(calculateQuote(input), input);
}

/* ---------- 汇率快照：打开页面 / 切换币种自动对齐，无刷新按钮（快照日内不变） ---------- */

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

let refreshSeq = 0;

async function refreshRate(): Promise<void> {
  const seq = ++refreshSeq;
  const from = $<HTMLSelectElement>('#fromCurrency').value;
  const to = 'CNY';
  const stored = readState().lastRate;
  rateMeta.textContent = `正在获取 1 ${from} 的汇率快照…`;

  const data = await fetchRateSnapshot(from, to);
  if (seq !== refreshSeq) return; // 用户快速连切币种，过期响应直接丢弃
  if (!data) {
    // 拉取失败但有上次快照：如实标注沿用，而不是直接让用户手填
    if (stored && stored.from === from) {
      rateMeta.textContent = `快照获取失败，沿用上次快照：1 ${stored.from} = ${stored.rate} ${stored.to}（更新于 ${fmtTime(stored.timestamp)}，来源 ${stored.source}），也可手动修改`;
    } else {
      rateMeta.textContent = '汇率快照获取失败，请手动输入';
    }
    return;
  }

  const rate = data.rate.toFixed(Math.abs(data.rate) < 0.1 ? 6 : 4).replace(/0+$/, '').replace(/\.$/, '');
  $<HTMLInputElement>('#exchangeRate').value = rate;
  rateMeta.textContent = data.stale
    ? `快照获取失败，沿用上次快照：1 ${from} = ${data.rate} ${to}（更新于 ${fmtTime(data.timestamp)}，来源 ${data.source}），也可手动修改`
    : `快照已更新：1 ${from} = ${data.rate} ${to}（${fmtTime(data.timestamp)}，来源 ${data.source}，每日更新）`;
  writeState({
    fields: readFields(),
    lastRate: { from, to, rate: data.rate, timestamp: data.timestamp, source: data.source },
  });
  renderLocalQuote();
}

/* ---------- Presets：localStorage，无账号 ---------- */

const BUILTIN_PRESETS: Record<string, Partial<FieldValues>> = {
  默认: { serviceRatePct: '8', minimumServiceFee: '10', platformFeeRatePct: '1', exchangeMarkupPct: '1.5', roundingMode: 'ceil1' },
  闲鱼普通代购: { serviceRatePct: '5', minimumServiceFee: '10', platformFeeRatePct: '5', exchangeMarkupPct: '1.5', roundingMode: 'ceil1' },
  熟人代购: { serviceRatePct: '0', minimumServiceFee: '0', platformFeeRatePct: '0', exchangeMarkupPct: '0', roundingMode: 'ceil1' },
  高价商品: { serviceRatePct: '8', minimumServiceFee: '30', platformFeeRatePct: '5', exchangeMarkupPct: '1.5', roundingMode: 'ceil10' },
  抢购商品: { serviceRatePct: '10', minimumServiceFee: '20', platformFeeRatePct: '6', exchangeMarkupPct: '3', roundingMode: 'ceil5' },
};

const presetSelect = $<HTMLSelectElement>('#preset-select');

function renderPresetOptions(selected?: string): void {
  const custom = readState().presets;
  presetSelect.innerHTML = '';
  for (const name of [...Object.keys(BUILTIN_PRESETS), ...Object.keys(custom)]) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = custom[name] ? `${name}（自定义）` : name;
    if (name === selected) opt.selected = true;
    presetSelect.appendChild(opt);
  }
}

presetSelect.addEventListener('change', () => {
  const name = presetSelect.value;
  const fields = BUILTIN_PRESETS[name] ?? readState().presets[name];
  if (fields) {
    applyFields(fields);
    writeState({ fields: { ...readFields() }, presetName: name });
    renderLocalQuote();
  }
});

$<HTMLButtonElement>('#preset-save').addEventListener('click', () => {
  const name = window.prompt('保存当前收费方案，名称：');
  if (!name?.trim()) return;
  writeState({ presets: { ...readState().presets, [name.trim()]: readFields() }, presetName: name.trim() });
  renderPresetOptions(name.trim());
});

$<HTMLButtonElement>('#preset-delete').addEventListener('click', () => {
  const name = presetSelect.value;
  if (name in BUILTIN_PRESETS) {
    window.alert('内置方案不可删除，可另存自定义方案');
    return;
  }
  const presets = { ...readState().presets };
  delete presets[name];
  writeState({ presets, presetName: undefined });
  renderPresetOptions('默认');
});

/* ---------- 复制报价（事件委托，面板内容更新后依然生效） ---------- */

resultPanel.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  if (!target.matches('[data-copy-quote]')) return;
  const panel = target.closest<HTMLElement>('.quote-panel');
  const encoded = panel?.dataset.copy;
  if (!encoded) return;
  const text = decodeURIComponent(encoded);
  try {
    await navigator.clipboard.writeText(text);
    target.textContent = '已复制 ✓';
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    target.textContent = '已复制 ✓';
  }
  setTimeout(() => { target.textContent = '复制报价'; }, 1500);
});

/* ---------- 币种标签联动 + 输入即算 ---------- */

function syncCurrencyLabel(): void {
  const from = $<HTMLSelectElement>('#fromCurrency').value;
  for (const el of document.querySelectorAll<HTMLElement>('[data-currency-label]')) el.textContent = from;
}

// 输入即算（300ms 防抖，纯本地计算）
let calcTimer: number | undefined;
form.addEventListener('input', () => {
  writeState({ fields: readFields() });
  window.clearTimeout(calcTimer);
  calcTimer = window.setTimeout(renderLocalQuote, 300);
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  renderLocalQuote(); // 「计算报价」按钮：跳过防抖立即重算
});
$<HTMLSelectElement>('#fromCurrency').addEventListener('change', () => {
  syncCurrencyLabel();
  writeState({ fromCurrency: $<HTMLSelectElement>('#fromCurrency').value as CurrencyCode });
  renderLocalQuote();
  void refreshRate(); // 换币种后旧汇率必然失效，自动拉取新快照
});

/* ---------- 初始化：恢复上次状态 → 本地首算 → 自动对齐今日快照 ---------- */

function init(): void {
  const state = readState();
  applyFields(state.fields);
  if (SUPPORTED_CURRENCIES.includes(state.fromCurrency)) {
    $<HTMLSelectElement>('#fromCurrency').value = state.fromCurrency;
  }
  renderPresetOptions(state.presetName);
  syncCurrencyLabel();
  if (state.lastRate && state.lastRate.from === $<HTMLSelectElement>('#fromCurrency').value) {
    const stored = state.lastRate;
    rateMeta.textContent = `上次汇率快照：1 ${stored.from} = ${stored.rate} ${stored.to}（更新于 ${fmtTime(stored.timestamp)}，来源 ${stored.source}）`;
  }
  renderLocalQuote();

  // 打开页面自动对齐今日快照：字段为空或仍是上次快照值时拉取；手改过的汇率不覆盖
  const rateField = $<HTMLInputElement>('#exchangeRate');
  const lastRate = state.lastRate;
  // 字段里存的是展示精度（如 USD 6.7173），与 lastRate 的全精度值用同样的舍入规则比对
  const isSnapshotValue = !!lastRate
    && lastRate.from === $<HTMLSelectElement>('#fromCurrency').value
    && rateField.value !== ''
    && rateField.value === lastRate.rate.toFixed(Math.abs(lastRate.rate) < 0.1 ? 6 : 4);
  if (!rateField.value || isSnapshotValue) {
    void refreshRate();
  } else {
    rateMeta.textContent += '；汇率已手动修改，未自动覆盖';
  }

  void navigator.serviceWorker?.register('./sw.js');
}

init();
