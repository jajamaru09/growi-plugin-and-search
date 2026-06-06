import type { PageSearchHit, SortKey, SortOrder } from './types.ts';

/** PageSearchHit[] を指定軸でソートした新しい配列を返す（非破壊） */
export function sortHits(
  hits: PageSearchHit[],
  key: SortKey,
  order: SortOrder,
): PageSearchHit[] {
  const sign = order === 'asc' ? 1 : -1;
  return [...hits].sort((a, b) => (a[key] - b[key]) * sign);
}
