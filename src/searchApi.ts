import type { RawHit } from './types.ts';

export const PAGE_LIMIT = 1000;
export const MAX_WINDOW = 10000;

const PLUGIN_NAME = 'growi-plugin-and-search';

function log(...args: unknown[]): void {
  const hub = (window as any).growiPluginHub;
  if (hub?.log) hub.log(PLUGIN_NAME, ...args);
  else console.log(`[${PLUGIN_NAME}]`, ...args);
}

/**
 * total件のヒットを PAGE_LIMIT ごとに取得するための offset 配列を返す。
 * offset + PAGE_LIMIT ≤ MAX_WINDOW の制約で先頭 MAX_WINDOW 件までに制限する。
 */
export function computePageOffsets(total: number): number[] {
  const reachable = Math.min(total, MAX_WINDOW);
  const offsets: number[] = [];
  for (let off = 0; off < reachable; off += PAGE_LIMIT) {
    offsets.push(off);
  }
  return offsets;
}

/**
 * 単語を GROWI のフレーズ検索（ダブルクォート）に変換する。
 *
 * GROWI の `/_api/search` は、引用符なしの語を multi_match(type: most_fields) で
 * 評価し、`operator` 未指定のため既定の OR で各フィールドを検索する。さらに
 * 日本語フィールド(body.ja等)は kuromoji_tokenizer で形態素分割されるため、
 * 例えば「クラウドサービス」は ["クラウド","サービス"] に分割され、
 * 「クラウド」または「サービス」を含むページまでヒットしてしまう（OR検索）。
 * その結果、1単語の取得集合が広くなり、AND積集合が崩れて OR のように見える。
 *
 * 語を `"..."` で囲むと parseQueryString が phrase として扱い、
 * multi_match(type: phrase) で形態素が隣接（=完全一致）したページだけがヒットする。
 * これにより1単語の取得集合が正確になり、真の AND 検索になる。
 */
export function toPhraseQuery(word: string): string {
  // フレーズ構文 /(-?"[^"]+")/ を壊さないよう、語中のダブルクォートは除去する。
  const sanitized = word.replace(/"/g, '');
  // 全て引用符だった等で空になった場合はそのまま返す（異常入力のフォールバック）。
  return sanitized.length > 0 ? `"${sanitized}"` : word;
}

/** 1ページ分の生レスポンスから RawHit[] と meta.total を取り出す */
interface SearchPageResponse {
  total: number;
  hits: RawHit[];
}

function toEpoch(v: unknown): number {
  if (typeof v === 'string' || typeof v === 'number') {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

function normalizeSnippet(snippet: unknown): string | null {
  if (snippet == null) return null;
  if (Array.isArray(snippet)) return snippet.join(' … ');
  if (typeof snippet === 'string') return snippet;
  return null;
}

/** 1つのクエリ(q)に対する取得進捗（ワードラベルは含まない） */
export interface QueryFetchProgress {
  fetched: number;
  total: number;
  capped: boolean;
  done: boolean;
}

/** 1クエリの全ヒット取得結果 */
export interface QueryFetchResult {
  hits: RawHit[];
  total: number;
  capped: boolean;
}

async function fetchSearchPage(
  q: string,
  offset: number,
  signal?: AbortSignal,
): Promise<SearchPageResponse> {
  const params = new URLSearchParams({
    q,
    offset: String(offset),
    limit: String(PAGE_LIMIT),
  });
  const res = await fetch(`/_api/search?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`GROWI search API error: ${res.status}`);
  const json = await res.json();

  const total: number = json?.meta?.total ?? 0;
  const items: any[] = Array.isArray(json?.data) ? json.data : [];
  const hits: RawHit[] = items.map((item) => {
    const page = item?.data ?? {};
    const creator = page?.creator;
    return {
      pageId: String(page?._id ?? ''),
      path: String(page?.path ?? ''),
      creatorName: String(creator?.name ?? creator?.username ?? '不明'),
      createdAt: toEpoch(page?.createdAt),
      updatedAt: toEpoch(page?.updatedAt),
      seenUserCount: Number(page?.seenUserCount ?? 0),
      snippet: normalizeSnippet(item?.meta?.elasticSearchResult?.snippet),
    };
  });
  return { total, hits };
}

/**
 * 任意のクエリ文字列 q の全ヒット（最大MAX_WINDOW件）を取得する。
 * q は呼び出し側が組み立てる（フレーズ化は toPhraseQuery を使う）。
 * onProgress は1ページ取得ごとに呼ばれる。
 */
export async function fetchAllHitsForQuery(
  q: string,
  onProgress: (p: QueryFetchProgress) => void,
  signal?: AbortSignal,
): Promise<QueryFetchResult> {
  // 1ページ目で total を確定
  const first = await fetchSearchPage(q, 0, signal);
  const capped = first.total > MAX_WINDOW;
  const offsets = computePageOffsets(first.total);
  const all: RawHit[] = [...first.hits];

  onProgress({ total: first.total, fetched: all.length, capped, done: offsets.length <= 1 });

  // 残りのページを順次取得（offsets[0] は取得済み）
  for (let i = 1; i < offsets.length; i++) {
    const page = await fetchSearchPage(q, offsets[i], signal);
    all.push(...page.hits);
    onProgress({ total: first.total, fetched: all.length, capped, done: i === offsets.length - 1 });
  }

  log('fetched query:', q, 'hits:', all.length, 'total:', first.total, 'capped:', capped);
  return { hits: all, total: first.total, capped };
}
