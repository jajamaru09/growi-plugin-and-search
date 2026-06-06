import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computePageOffsets,
  toPhraseQuery,
  fetchAllHitsForQuery,
  PAGE_LIMIT,
  MAX_WINDOW,
} from './searchApi';

describe('toPhraseQuery', () => {
  it('単語をダブルクォートで囲んでフレーズ検索にする', () => {
    // GROWIは引用符なしだと multi_match(most_fields) のOR演算子で
    // 形態素ごとのOR検索になってしまう。引用符で囲むと phrase 検索になり
    // 形態素が隣接（=完全一致）したページだけがヒットする。
    expect(toPhraseQuery('クラウドサービス')).toBe('"クラウドサービス"');
    expect(toPhraseQuery('東京')).toBe('"東京"');
  });

  it('単語内のダブルクォートは除去してフレーズ構文を壊さない', () => {
    expect(toPhraseQuery('foo"bar')).toBe('"foobar"');
  });
});

describe('fetchAllHitsForQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('渡したクエリ文字列をそのままqに送る', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ meta: { total: 1 }, data: [] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    // 呼び出し側がフレーズ化した文字列を渡す想定
    await fetchAllHitsForQuery(toPhraseQuery('クラウドサービス'), () => {});

    const calledUrl = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=%22');
    expect(decodeURIComponent(calledUrl)).toContain('q="クラウドサービス"');
  });
});

describe('computePageOffsets', () => {
  it('total以下のページのoffsetを返す', () => {
    expect(computePageOffsets(50)).toEqual([0]);
    expect(computePageOffsets(1000)).toEqual([0]);
    expect(computePageOffsets(1001)).toEqual([0, 1000]);
    expect(computePageOffsets(2500)).toEqual([0, 1000, 2000]);
  });

  it('10000を超えるtotalは10000で打ち切る', () => {
    // offset 0,1000,...,9000 の10ページ（9000+1000=10000 ≤ MAX_WINDOW）
    expect(computePageOffsets(50000)).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]);
  });

  it('定数の妥当性', () => {
    expect(PAGE_LIMIT).toBe(1000);
    expect(MAX_WINDOW).toBe(10000);
  });
});
