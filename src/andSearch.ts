import type { RawHit, PageSearchHit, SearchProgress } from './types.ts';
import { fetchAllHitsForQuery, toPhraseQuery, MAX_WINDOW } from './searchApi.ts';

/** 半角・全角スペースで分割し、空要素を除去 */
export function splitWords(input: string): string[] {
  return input.split(/[\s　]+/).filter((w) => w.length > 0);
}

/** 大文字小文字を無視した部分一致 */
function includesCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** ハイライトHTML(<em>等)を除去して素のテキストにする */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * 1ワードの「候補ページ集合」を取得する。
 *
 * GROWI検索は本文/パスとも OR（kuromoji形態素のOR）になるため、2系統で取得して合成する:
 *  1) フレーズ検索 `"word"` … 本文の完全一致（形態素隣接）。body/path.raw/comments対象。
 *  2) 通常検索 `word`      … path.ja等で広く拾った集合を、パスにwordを部分一致で含むものだけ残す
 *                            （= タイトル/パス一致をクライアント側で厳密判定し復元）。
 * 1∪2 により「本文に正確に含む」または「タイトル(パス)に含む」ページが候補になる。
 *
 * 進捗は word をラベルに、2系統の合算値で1行にまとめて通知する。
 */
async function fetchWordCandidates(
  word: string,
  onProgress: (p: SearchProgress) => void,
  signal?: AbortSignal,
): Promise<{ hits: RawHit[]; capped: boolean }> {
  // 2系統それぞれの進捗を保持し、合算した1件の SearchProgress を通知する。
  let pf = 0;
  let pt = 0;
  let pCapped = false;
  let pDone = false;
  let rf = 0;
  let rt = 0;
  let rCapped = false;
  let rDone = false;
  const emit = () => {
    onProgress({
      word,
      fetched: pf + rf,
      total: Math.min(pt, MAX_WINDOW) + Math.min(rt, MAX_WINDOW),
      capped: pCapped || rCapped,
      done: pDone && rDone,
      phraseFetched: pf,
      rawFetched: rf,
    });
  };

  const [phrase, raw] = await Promise.all([
    fetchAllHitsForQuery(
      toPhraseQuery(word),
      (p) => {
        pf = p.fetched;
        pt = p.total;
        pCapped = p.capped;
        pDone = p.done;
        emit();
      },
      signal,
    ),
    fetchAllHitsForQuery(
      word,
      (p) => {
        rf = p.fetched;
        rt = p.total;
        rCapped = p.capped;
        rDone = p.done;
        emit();
      },
      signal,
    ),
  ]);

  // 通常検索の広い集合（kuromoji形態素OR・英語edge_ngram前方一致を含む）から、
  // 「word が path に部分一致」または「word が本文スニペットに連続して出現」する
  // ものだけを採用する。これにより:
  //  - 英語の前方一致（func→function）はスニペットに function が出るので復元される
  //  - 日本語の形態素OR誤検出（「クラウド」だけ等）はスニペットに語が連続しないので除外
  //  - タイトル/パス一致も復元
  const verifiedHits = raw.hits.filter(
    (h) => includesCI(h.path, word) || (h.snippet != null && includesCI(stripTags(h.snippet), word)),
  );

  // pageId で和集合。本文スニペットを持つフレーズ側を優先する。
  const byId = new Map<string, RawHit>();
  for (const h of phrase.hits) if (!byId.has(h.pageId)) byId.set(h.pageId, h);
  for (const h of verifiedHits) if (!byId.has(h.pageId)) byId.set(h.pageId, h);

  return { hits: [...byId.values()], capped: phrase.capped || raw.capped };
}

function titleFromPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed || path;
}

/**
 * 各ワードのヒット配列を受け取り、全ワードに存在する pageId だけ残して
 * PageSearchHit（スニペットマージ済み）を返す。
 * メタ情報は wordHits[0] 側のヒットを採用する。
 */
export function intersectHits(wordHits: RawHit[][]): PageSearchHit[] {
  if (wordHits.length === 0) return [];

  // 各ワードを pageId -> RawHit の Map に
  const maps = wordHits.map((hits) => {
    const m = new Map<string, RawHit>();
    for (const h of hits) {
      if (!m.has(h.pageId)) m.set(h.pageId, h);
    }
    return m;
  });

  // 最小サイズの Map を基準に走査（積集合の効率化）
  const base = maps.reduce((a, b) => (a.size <= b.size ? a : b));

  const result: PageSearchHit[] = [];
  for (const [pageId, baseHit] of base) {
    if (!maps.every((m) => m.has(pageId))) continue;

    // スニペットマージ（null除外・重複除去・出現順維持）
    const snippets: string[] = [];
    for (const m of maps) {
      const s = m.get(pageId)?.snippet;
      if (s != null && !snippets.includes(s)) snippets.push(s);
    }

    // メタは wordHits[0] のヒットを優先、無ければ base
    const metaHit = maps[0].get(pageId) ?? baseHit;
    result.push({
      pageId,
      path: metaHit.path,
      title: titleFromPath(metaHit.path),
      creatorName: metaHit.creatorName,
      createdAt: metaHit.createdAt,
      updatedAt: metaHit.updatedAt,
      seenUserCount: metaHit.seenUserCount,
      snippets,
    });
  }
  return result;
}

export interface AndSearchResult {
  hits: PageSearchHit[];
  cappedWords: string[]; // 10000件超で打ち切ったワード（警告表示用）
}

/**
 * 入力文字列に対して AND 検索を実行する。
 * onProgress は各ワードの取得進捗ごとに呼ばれる。
 */
export async function runAndSearch(
  input: string,
  onProgress: (p: SearchProgress) => void,
  signal?: AbortSignal,
): Promise<AndSearchResult> {
  const words = splitWords(input);
  if (words.length === 0) return { hits: [], cappedWords: [] };

  const cappedWords: string[] = [];
  const wordHits: RawHit[][] = [];
  for (const word of words) {
    const { hits, capped } = await fetchWordCandidates(word, onProgress, signal);
    if (capped && !cappedWords.includes(word)) cappedWords.push(word);
    // どれか1ワードでも候補0件なら積集合は空（AND成立せず）
    if (hits.length === 0) return { hits: [], cappedWords };
    wordHits.push(hits);
  }

  return { hits: intersectHits(wordHits), cappedWords };
}
