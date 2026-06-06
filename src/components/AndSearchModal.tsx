import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageSearchHit, SortKey, SortOrder, SearchProgress } from '../types';
import { ResultList } from './ResultList';
import { PreviewPane } from './PreviewPane';

const MIN_PCT = 20;
const MAX_PCT = 80;

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
  searching: boolean;
  hasSearched: boolean;
  elapsedMs: number | null;
  progress: SearchProgress[];
  highlightWords: string[];
  cappedWords: string[];
  creatorQuery: string;
  onCreatorChange: (q: string) => void;
  hits: PageSearchHit[];
  sortKey: SortKey;
  sortOrder: SortOrder;
  onSortChange: (key: SortKey, order: SortOrder) => void;
  selectedId: string | null;
  onSelect: (pageId: string) => void;
  onClose: () => void;
}

const SORT_OPTIONS: { value: string; label: string; key: SortKey; order: SortOrder }[] = [
  { value: 'updatedAt:desc', label: '更新日（新しい順）', key: 'updatedAt', order: 'desc' },
  { value: 'updatedAt:asc', label: '更新日（古い順）', key: 'updatedAt', order: 'asc' },
  { value: 'createdAt:desc', label: '作成日（新しい順）', key: 'createdAt', order: 'desc' },
  { value: 'createdAt:asc', label: '作成日（古い順）', key: 'createdAt', order: 'asc' },
  { value: 'seenUserCount:desc', label: '閲覧者数（多い順）', key: 'seenUserCount', order: 'desc' },
];

export function AndSearchModal(props: Props) {
  const {
    query, onQueryChange, onSubmit, searching, hasSearched, elapsedMs, progress, cappedWords,
    highlightWords, creatorQuery, onCreatorChange, hits, sortKey, sortOrder, onSortChange,
    selectedId, onSelect, onClose,
  } = props;

  // モーダルを開いたらキーワード入力にフォーカスする。
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // モーダルを閉じるのは「オーバーレイ上で押して、オーバーレイ上でリリースした」とき**だけ**。
  // ダイアログ内で押して外でリリースした（テキスト選択ドラッグ等）場合は閉じない。
  // pointerdown の対象を覚えておき、pointerup の対象と両方がオーバーレイ自身かを判定する。
  const overlayPointerDownRef = useRef(false);
  const onOverlayPointerDown = useCallback((e: React.PointerEvent) => {
    overlayPointerDownRef.current = e.target === e.currentTarget;
  }, []);
  const onOverlayPointerUp = useCallback((e: React.PointerEvent) => {
    const startedOnOverlay = overlayPointerDownRef.current;
    overlayPointerDownRef.current = false;
    if (startedOnOverlay && e.target === e.currentTarget) onClose();
  }, [onClose]);

  // 左右ペインの分割比（左=結果リストの幅%）。スプリッターのドラッグで更新する。
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [listWidthPct, setListWidthPct] = useState(50);

  const onSplitterDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const container = splitRef.current;
    if (!container) return;
    const onMove = (ev: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setListWidthPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.userSelect = 'none';
  }, []);

  return (
    <>
      <div className="modal-backdrop fade show" />
      <div
        className="modal fade show d-block"
        role="dialog"
        tabIndex={-1}
        onPointerDown={onOverlayPointerDown}
        onPointerUp={onOverlayPointerUp}
      >
        <div className="modal-dialog modal-xl modal-dialog-centered" style={{ height: '90vh' }}>
          <div className="modal-content h-100">
            <div className="modal-header">
              <div className="d-flex align-items-center gap-2">
                <h5 className="modal-title mb-0">AND検索</h5>
                {hasSearched && (
                  <>
                    <span className="badge bg-primary fs-6 fw-semibold">{hits.length} 件</span>
                    {elapsedMs != null && (
                      <span className="text-body-secondary small">検索 {(elapsedMs / 1000).toFixed(2)} 秒</span>
                    )}
                  </>
                )}
              </div>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>

            <div className="modal-body d-flex flex-column p-0 overflow-hidden">
              <div className="p-3 border-bottom d-flex gap-2 align-items-center flex-wrap">
                <input
                  ref={inputRef}
                  type="text"
                  className="form-control flex-grow-1"
                  placeholder="スペース区切りで複数ワード（AND検索）"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
                />
                <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={searching}>
                  <span className="material-symbols-outlined align-middle">search</span> 検索
                </button>
                <div className="input-group w-auto" style={{ maxWidth: 220 }} title="検索結果を作成者名で絞り込み（部分一致）">
                  <span className="input-group-text">
                    <span className="material-symbols-outlined align-middle fs-6" aria-hidden="true">person</span>
                  </span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="作成者で絞り込み"
                    value={creatorQuery}
                    onChange={(e) => onCreatorChange(e.target.value)}
                  />
                </div>
                <select
                  className="form-select w-auto"
                  value={`${sortKey}:${sortOrder}`}
                  onChange={(e) => {
                    const opt = SORT_OPTIONS.find((o) => o.value === e.target.value);
                    if (opt) onSortChange(opt.key, opt.order);
                  }}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div className="w-100 text-body-secondary" style={{ fontSize: '0.75rem' }}>
                  ヒント：<code>func</code> は部分一致（<code>function</code> などにもヒット）。
                  <code>"func"</code> のように <b>"" で囲むと完全一致</b>に絞り込めます（タイトル/本文の部分一致を除外）。
                </div>
              </div>

              {progress.length > 0 && (
                <div className="px-3 py-2 border-bottom small">
                  <div className="text-body-secondary mb-1" style={{ fontSize: '0.75rem' }}>
                    取得件数 = <b>完全一致</b>(フレーズ) ＋ <b>通常検索</b> の2系統。
                    ここから重複排除・本文/タイトル検証・AND積集合を経た件数が右上のバッヂです。
                  </div>
                  {progress.map((p) => {
                    // meta.total には削除済み/権限外などインデックスにのみ残る件数が含まれ、
                    // 実際に取得できる件数(fetched)を上回ることがある（例 251/253）。
                    // 取得完了かつ未打ち切りなら、実取得数を分母にして「止まって見える」のを防ぐ。
                    const denom = p.done && !p.capped ? p.fetched : Math.min(p.total, 10000);
                    const pct = p.done ? 100 : (denom ? Math.round((p.fetched / denom) * 100) : 100);
                    return (
                      <div key={p.word} className="d-flex align-items-center gap-2">
                        <span className="text-truncate" style={{ minWidth: 80 }}>{p.word}</span>
                        <div className="progress flex-grow-1" style={{ height: 6 }}>
                          <div className="progress-bar" style={{ width: `${pct}%` }} />
                        </div>
                        <span
                          className="text-muted text-nowrap"
                          title={`完全一致(フレーズ)検索 ${p.phraseFetched} 件 ＋ 通常検索 ${p.rawFetched} 件`}
                        >
                          {p.phraseFetched}＋{p.rawFetched}{p.capped ? '（上限）' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {cappedWords.length > 0 && (
                <div className="alert alert-warning rounded-0 mb-0 py-2 small">
                  次のワードは1万件を超えるため先頭1万件のみで判定しました（結果が不完全な可能性）: {cappedWords.join(', ')}
                </div>
              )}

              <div ref={splitRef} className="d-flex flex-grow-1 overflow-hidden">
                <div className="overflow-auto" style={{ width: `${listWidthPct}%`, flex: '0 0 auto' }}>
                  {!searching && hits.length === 0
                    ? <div className="p-3 text-muted">{hasSearched ? '該当ページがありません。' : 'スペース区切りでワードを入力して検索してください。'}</div>
                    : <ResultList hits={hits} selectedId={selectedId} onSelect={onSelect} onNavigate={onClose} />}
                </div>
                {/* ドラッグで左右比率を自由に調整できる全高スプリッター */}
                <div
                  onPointerDown={onSplitterDown}
                  role="separator"
                  aria-orientation="vertical"
                  title="ドラッグして幅を調整"
                  style={{
                    flex: '0 0 auto',
                    width: 6,
                    cursor: 'col-resize',
                    background: 'var(--bs-border-color, #dee2e6)',
                    touchAction: 'none',
                  }}
                />
                <div className="overflow-hidden" style={{ flex: '1 1 0', minWidth: 0 }}>
                  <PreviewPane pageId={selectedId} highlightWords={highlightWords} />
                </div>
              </div>
            </div>

            <div className="modal-footer py-2">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>閉じる</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
