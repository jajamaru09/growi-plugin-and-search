import { useEffect, useRef, useState } from 'react';
import type { PageSearchHit } from '../types';
import { ResultItem } from './ResultItem';

const PAGE_SIZE = 30;

interface Props {
  hits: PageSearchHit[];
  selectedId: string | null;
  onSelect: (pageId: string) => void;
  onNavigate: () => void;
}

export function ResultList({ hits, selectedId, onSelect, onNavigate }: Props) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hitsLenRef = useRef(hits.length);
  hitsLenRef.current = hits.length;

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [hits]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisible((v) => Math.min(v + PAGE_SIZE, hitsLenRef.current));
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="list-group list-group-flush">
      {hits.slice(0, visible).map((hit) => (
        <ResultItem
          key={hit.pageId}
          hit={hit}
          selected={hit.pageId === selectedId}
          onSelect={onSelect}
          onNavigate={onNavigate}
        />
      ))}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  );
}
