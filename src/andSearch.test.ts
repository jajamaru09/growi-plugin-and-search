import { describe, it, expect, vi, afterEach } from 'vitest';
import { splitWords, intersectHits, runAndSearch } from './andSearch';
import type { RawHit } from './types';

function hit(pageId: string, snippet: string | null, over: Partial<RawHit> = {}): RawHit {
  return {
    pageId, path: `/p/${pageId}`, creatorName: 'u',
    createdAt: 1, updatedAt: 2, seenUserCount: 0, snippet, ...over,
  };
}

describe('splitWords', () => {
  it('スペースで分割し空要素を除く', () => {
    expect(splitWords('  word1   word2 ')).toEqual(['word1', 'word2']);
  });
  it('全角スペースも区切りにする', () => {
    expect(splitWords('word1　word2')).toEqual(['word1', 'word2']);
  });
  it('単語1つでもよい', () => {
    expect(splitWords('solo')).toEqual(['solo']);
  });
  it('空文字や空白のみは空配列', () => {
    expect(splitWords('')).toEqual([]);
    expect(splitWords('   ')).toEqual([]);
  });
});

describe('intersectHits', () => {
  it('全ワードに存在するpageIdだけ残す', () => {
    const w1 = [hit('A', '<em>w1</em>A'), hit('B', '<em>w1</em>B')];
    const w2 = [hit('B', '<em>w2</em>B'), hit('C', '<em>w2</em>C')];
    const result = intersectHits([w1, w2]);
    expect(result.map((r) => r.pageId)).toEqual(['B']);
  });

  it('各ワードのスニペットをマージする', () => {
    const w1 = [hit('B', '<em>w1</em>B')];
    const w2 = [hit('B', '<em>w2</em>B')];
    const result = intersectHits([w1, w2]);
    expect(result[0].snippets).toEqual(['<em>w1</em>B', '<em>w2</em>B']);
  });

  it('nullスニペットは除外し、重複断片は1つにまとめる', () => {
    const w1 = [hit('B', '<em>same</em>')];
    const w2 = [hit('B', null)];
    const w3 = [hit('B', '<em>same</em>')];
    const result = intersectHits([w1, w2, w3]);
    expect(result[0].snippets).toEqual(['<em>same</em>']);
  });

  it('titleはpath末尾から導出する', () => {
    const w1 = [hit('B', null, { path: '/foo/bar/baz' })];
    const result = intersectHits([w1]);
    expect(result[0].title).toBe('baz');
  });

  it('メタは最初のワードのヒットを採用する', () => {
    const w1 = [hit('B', null, { seenUserCount: 5, updatedAt: 100 })];
    const w2 = [hit('B', null, { seenUserCount: 99, updatedAt: 999 })];
    const result = intersectHits([w1, w2]);
    expect(result[0].seenUserCount).toBe(5);
    expect(result[0].updatedAt).toBe(100);
  });
  it('いずれかのワードのヒットが0件なら結果は空', () => {
    const w1 = [hit('A', 'x'), hit('B', 'x')];
    const w2: RawHit[] = [];
    expect(intersectHits([w1, w2])).toEqual([]);
  });
});

// GROWIレスポンス1件分（{ data:{page}, meta:{elasticSearchResult:{snippet}} }）を作る
function apiItem(id: string, path: string, snippet: string | null) {
  return {
    data: {
      _id: id,
      path,
      creator: { name: 'tanaka' },
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-02T00:00:00Z',
      seenUserCount: 0,
    },
    meta: { elasticSearchResult: { snippet } },
  };
}

function stubFetch(responder: (q: string, offset: number) => { total: number; items: any[] }) {
  const fetchMock = vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    const q = u.searchParams.get('q') ?? '';
    const offset = Number(u.searchParams.get('offset') ?? 0);
    const { total, items } = responder(q, offset);
    return { ok: true, json: async () => ({ meta: { total }, data: items }) };
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

describe('runAndSearch（タイトル一致の復元とOR誤検出の除外）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('本文の完全一致(フレーズ)とタイトル(パス)一致を拾い、本文の形態素OR誤検出は除外する', async () => {
    // 「クラウドサービス」を検索:
    //  - phrase("...") → 本文に正確に含む B のみ
    //  - 通常検索       → B, C(「クラウド」だけ一致のOR誤検出), T(パスに語を含むタイトル一致)
    const fetchMock = stubFetch((q) => {
      const isPhrase = q.startsWith('"');
      if (isPhrase) {
        return { total: 1, items: [apiItem('B', '/p/B', '<em>クラウドサービス</em>本文')] };
      }
      return {
        total: 3,
        items: [
          apiItem('B', '/p/B', '<em>クラウドサービス</em>本文'),
          apiItem('C', '/p/C', '<em>クラウド</em>だけ'), // パスに語を含まない=タイトル不一致
          apiItem('T', '/docs/クラウドサービス入門', null), // パスに語を含む=タイトル一致
        ],
      };
    });

    const { hits } = await runAndSearch('クラウドサービス', () => {});
    const ids = hits.map((h) => h.pageId).sort();

    expect(ids).toEqual(['B', 'T']); // C(OR誤検出)は除外
    // 念のため: phraseと通常の2系統が叩かれている
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('英語の前方一致(func→function)を本文スニペットで復元する', async () => {
    // GROWIの body.en は edge_ngram なので通常検索 func は function にヒットする。
    // パスに func は無く、本文スニペットにだけ function が出るケース。
    stubFetch((q) => {
      if (q.startsWith('"')) return { total: 0, items: [] }; // "func" 完全一致は無し
      return { total: 1, items: [apiItem('F', '/p/F', 'call the <em>func</em>tion here')] };
    });
    const { hits } = await runAndSearch('func', () => {});
    expect(hits.map((h) => h.pageId)).toEqual(['F']);
  });

  it('日本語の形態素OR誤検出はスニペットに語が連続しない限り除外する', async () => {
    // 「クラウド」だけ一致（サービス無し）。パスにもスニペットにも「クラウドサービス」は連続しない。
    stubFetch((q) => {
      if (q.startsWith('"')) return { total: 0, items: [] };
      return { total: 1, items: [apiItem('C', '/p/C', '導入した<em>クラウド</em>の話')] };
    });
    const { hits } = await runAndSearch('クラウドサービス', () => {});
    expect(hits).toEqual([]);
  });

  it('2ワードANDではそれぞれの候補集合の積をとる', async () => {
    // word1=クラウド: 候補 {X(本文), Y(タイトル/docs/クラウド)}
    // word2=料金:     候補 {Y(本文), Z(タイトル/料金)}
    // 積集合 → {Y}
    stubFetch((q) => {
      const phrase = q.startsWith('"');
      const word = q.replace(/"/g, '');
      if (word === 'クラウド') {
        return phrase
          ? { total: 1, items: [apiItem('X', '/p/X', '<em>クラウド</em>')] }
          : { total: 2, items: [apiItem('X', '/p/X', '<em>クラウド</em>'), apiItem('Y', '/docs/クラウド', null)] };
      }
      // 料金
      return phrase
        ? { total: 1, items: [apiItem('Y', '/docs/クラウド', '<em>料金</em>表')] }
        : { total: 2, items: [apiItem('Y', '/docs/クラウド', '<em>料金</em>表'), apiItem('Z', '/p/料金', null)] };
    });

    const { hits } = await runAndSearch('クラウド 料金', () => {});
    expect(hits.map((h) => h.pageId)).toEqual(['Y']);
  });
});
