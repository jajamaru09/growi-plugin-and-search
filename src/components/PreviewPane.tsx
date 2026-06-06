import { useCallback, useEffect, useRef, useState } from 'react';
import { renderPagePreview } from '../pagePreview';

interface Props {
  pageId: string | null;
  highlightWords: string[];
}

/** マーカーレール上の1つの印（ハイライト位置） */
interface Marker {
  topPct: number; // スクロール全体に対する縦位置（%）
  top: number; // スクロールコンテナ内の絶対オフセット(px)
}

export function PreviewPane({ pageId, highlightWords }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);

  // プレビュー内の <mark> 位置を集計してレール用のマーカー配列を作る
  const computeMarkers = useCallback(() => {
    const scroll = scrollRef.current;
    const content = containerRef.current;
    if (!scroll || !content) {
      setMarkers([]);
      return;
    }
    const sh = scroll.scrollHeight;
    if (sh === 0) {
      setMarkers([]);
      return;
    }
    const containerTop = scroll.getBoundingClientRect().top;
    const result: Marker[] = [];
    const seen = new Set<number>();
    content.querySelectorAll<HTMLElement>('.grw-and-search-hl').forEach((el) => {
      const top = el.getBoundingClientRect().top - containerTop + scroll.scrollTop;
      const topPct = Math.min(100, Math.max(0, (top / sh) * 100));
      const key = Math.round(topPct * 2); // 近接する印はまとめる
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ topPct, top });
    });
    setMarkers(result);
  }, []);

  const scrollToMarker = useCallback((top: number) => {
    scrollRef.current?.scrollTo({ top: Math.max(0, top - 48), behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    setMarkers([]);
    if (!pageId) {
      target.innerHTML = '';
      return;
    }
    const controller = new AbortController();
    target.innerHTML = '';
    setLoading(true);
    setError(null);
    let settleTimer: number | undefined;
    renderPagePreview(pageId, target, controller.signal, highlightWords)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'プレビューの取得に失敗しました');
        }
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        computeMarkers();
        // 画像読み込み等でレイアウトが確定した後に再計算
        settleTimer = window.setTimeout(computeMarkers, 400);
      });
    return () => {
      controller.abort();
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [pageId, highlightWords, computeMarkers]);

  // ペインのリサイズで位置がずれた場合に再計算
  useEffect(() => {
    const onResize = () => computeMarkers();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [computeMarkers]);

  return (
    <div className="h-100 d-flex">
      <div
        ref={scrollRef}
        className="overflow-auto p-3"
        style={{ flex: '1 1 0', minWidth: 0 }}
      >
        {!pageId && <div className="text-muted">左の結果からページを選択するとプレビューが表示されます。</div>}
        {loading && <div className="text-muted"><span className="spinner-border spinner-border-sm me-2" />読み込み中…</div>}
        {error && <div className="alert alert-warning">{error}</div>}
        <div ref={containerRef} className="wiki" />
      </div>
      {markers.length > 0 && (
        <div
          title={`ハイライト ${markers.length} 件（クリックで移動）`}
          style={{
            position: 'relative',
            flex: '0 0 auto',
            width: 12,
            background: 'rgba(0,0,0,0.04)',
          }}
        >
          {markers.map((m, i) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              onClick={() => scrollToMarker(m.top)}
              style={{
                position: 'absolute',
                left: 1,
                right: 1,
                top: `${m.topPct}%`,
                height: 3,
                background: '#fd7e14',
                borderRadius: 1,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
