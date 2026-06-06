import { describe, it, expect } from 'vitest';
import { sortHits } from './sortResults';
import type { PageSearchHit } from './types';

function h(pageId: string, over: Partial<PageSearchHit>): PageSearchHit {
  return {
    pageId, path: '/' + pageId, title: pageId, creatorName: 'u',
    createdAt: 0, updatedAt: 0, seenUserCount: 0, snippets: [], ...over,
  };
}

describe('sortHits', () => {
  const hits = [
    h('A', { updatedAt: 100, createdAt: 1, seenUserCount: 5 }),
    h('B', { updatedAt: 300, createdAt: 3, seenUserCount: 1 }),
    h('C', { updatedAt: 200, createdAt: 2, seenUserCount: 9 }),
  ];

  it('updatedAt desc', () => {
    expect(sortHits(hits, 'updatedAt', 'desc').map((x) => x.pageId)).toEqual(['B', 'C', 'A']);
  });
  it('updatedAt asc', () => {
    expect(sortHits(hits, 'updatedAt', 'asc').map((x) => x.pageId)).toEqual(['A', 'C', 'B']);
  });
  it('seenUserCount desc', () => {
    expect(sortHits(hits, 'seenUserCount', 'desc').map((x) => x.pageId)).toEqual(['C', 'A', 'B']);
  });
  it('元配列を破壊しない', () => {
    sortHits(hits, 'createdAt', 'asc');
    expect(hits.map((x) => x.pageId)).toEqual(['A', 'B', 'C']);
  });
});
