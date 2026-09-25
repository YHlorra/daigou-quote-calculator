/**
 * 汇率快照获取（浏览器端，纯静态部署无服务端可用）。
 *
 * er-api 免费源是每日更新一次的快照，UI 一律如实标注来源与时间，不得声称「实时」。
 * 快照按基准币种整包缓存进 localStorage，12h 内视为新鲜；拉取失败回退过期快照（stale: true）。
 * frankfurter（ECB）作备用源，覆盖除 TWD 外的全部币种；两源都失败且无缓存时返回 null。
 */

export interface RateSnapshot {
  rate: number;
  /** 快照时间 Unix ms */
  timestamp: number;
  source: string;
  /** true = 拉取失败，回退的过期快照 */
  stale: boolean;
}

const STORAGE_KEY = 'proxy-calc-rates-v1';
const FRESH_MS = 12 * 60 * 60 * 1000;

const SOURCES = [
  { name: 'er-api', url: (base: string) => `https://open.er-api.com/v6/latest/${base}` },
  { name: 'frankfurter', url: (base: string) => `https://api.frankfurter.dev/v1/latest?base=${base}` },
] as const;

interface BaseEntry {
  timestamp: number;
  source: string;
  rates: Record<string, number>;
}

type RateCache = Record<string, BaseEntry>;

function loadCache(): RateCache {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as RateCache;
  } catch {
    return {};
  }
}

function saveCache(cache: RateCache): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // 隐私模式等禁存储场景：不持久化，仅影响下次离线回退
  }
}

async function fetchLive(base: string): Promise<{ source: string; rates: Record<string, number> } | null> {
  for (const source of SOURCES) {
    try {
      // 冷启动首次跨境外连可能很慢（尤其国内网络），15s 上限避免轻易放弃
      const res = await fetch(source.url(base), { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const json = (await res.json()) as { rates?: Record<string, number> };
      if (json?.rates && typeof json.rates === 'object') return { source: source.name, rates: json.rates };
    } catch {
      // 换下一个源；全部失败返回 null
    }
  }
  return null;
}

export async function fetchRateSnapshot(base: string, quote: string): Promise<RateSnapshot | null> {
  const entry = loadCache()[base];
  const cached = entry?.rates?.[quote];

  if (entry && typeof cached === 'number' && cached > 0 && Date.now() - entry.timestamp < FRESH_MS) {
    return { rate: cached, timestamp: entry.timestamp, source: entry.source, stale: false };
  }

  const live = await fetchLive(base);
  const rate = live?.rates?.[quote];
  if (live && typeof rate === 'number' && rate > 0) {
    const next: BaseEntry = { timestamp: Date.now(), source: live.source, rates: live.rates };
    const cache = loadCache();
    cache[base] = next;
    saveCache(cache);
    return { rate, timestamp: next.timestamp, source: live.source, stale: false };
  }

  if (typeof cached === 'number' && cached > 0 && entry) {
    return { rate: cached, timestamp: entry.timestamp, source: entry.source, stale: true };
  }
  return null;
}
