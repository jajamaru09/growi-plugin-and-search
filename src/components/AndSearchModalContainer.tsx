import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PageSearchHit, SearchProgress, SortKey, SortOrder } from '../types';
import { runAndSearch, splitWords } from '../andSearch';
import { sortHits } from '../sortResults';
import { clearPreviewCache } from '../pagePreview';
import { AndSearchModal } from './AndSearchModal';

interface Props {
  onClose: () => void;
}

export function AndSearchModalContainer({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, SearchProgress>>({});
  const [rawHits, setRawHits] = useState<PageSearchHit[]>([]);
  const [cappedWords, setCappedWords] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [highlightWords, setHighlightWords] = useState<string[]>([]);
  const [creatorQuery, setCreatorQuery] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearPreviewCache();
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setHasSearched(true);
    setProgressMap({});
    setRawHits([]);
    setCappedWords([]);
    setSelectedId(null);
    setElapsedMs(null);
    // 完全一致指定の "" はハイライト用には外す（語そのものを強調するため）。
    setHighlightWords(
      splitWords(query)
        .map((w) => w.replace(/^"|"$/g, ''))
        .filter((w) => w.length > 0),
    );

    const startedAt = performance.now();

    try {
      const { hits, cappedWords } = await runAndSearch(
        query,
        (p) => {
          if (controller.signal.aborted) return;
          setProgressMap((prev) => ({ ...prev, [p.word]: p }));
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setRawHits(hits);
      setCappedWords(cappedWords);
      setElapsedMs(performance.now() - startedAt);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      if (!controller.signal.aborted) {
        const hub = (window as any).growiPluginHub;
        hub?.log?.('growi-plugin-and-search', 'search error:', e);
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, [query]);

  const hits = useMemo(() => {
    // 作成者フィルタ（クライアント側・部分一致・大文字小文字無視）。
    // GROWIの全文検索はusername(keyword)を検索対象にしないため、
    // 既に結果に含まれている creatorName を使って絞り込む。
    const c = creatorQuery.trim().toLowerCase();
    const filtered = c
      ? rawHits.filter((h) => h.creatorName.toLowerCase().includes(c))
      : rawHits;
    return sortHits(filtered, sortKey, sortOrder);
  }, [rawHits, creatorQuery, sortKey, sortOrder]);

  const progress = useMemo(() => Object.values(progressMap), [progressMap]);

  return (
    <AndSearchModal
      query={query}
      onQueryChange={setQuery}
      onSubmit={handleSubmit}
      searching={searching}
      hasSearched={hasSearched}
      elapsedMs={elapsedMs}
      progress={progress}
      highlightWords={highlightWords}
      cappedWords={cappedWords}
      creatorQuery={creatorQuery}
      onCreatorChange={setCreatorQuery}
      hits={hits}
      sortKey={sortKey}
      sortOrder={sortOrder}
      onSortChange={(k, o) => { setSortKey(k); setSortOrder(o); }}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onClose={onClose}
    />
  );
}
