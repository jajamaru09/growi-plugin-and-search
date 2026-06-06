import type { PageSearchHit } from '../types';
import { spaNavigateToPage } from '../navigate';

interface Props {
  hit: PageSearchHit;
  selected: boolean;
  onSelect: (pageId: string) => void;
  /** SPA遷移に成功した直後に呼ばれる（モーダルを閉じる用） */
  onNavigate: () => void;
}

function formatDate(epoch: number): string {
  if (!epoch) return '-';
  const d = new Date(epoch);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ResultItem({ hit, selected, onSelect, onNavigate }: Props) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 行のキーボード操作（Enter/Space）でプレビュー選択
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(hit.pageId);
    }
  };

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // 行クリック（プレビュー選択）の発火を防ぐ
    // 修飾キー付き/左クリック以外は、ブラウザ標準動作（別タブ等）に委ねる
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // GROWIネイティブ検索と同じ Next.js Pages Router でSPA遷移。
    // 成功したらフルリロードを止めてモーダルを閉じる。未対応環境は <a href> に委ねる。
    if (spaNavigateToPage(hit.pageId)) {
      e.preventDefault();
      onNavigate();
    }
  };

  return (
    // 行クリック=プレビュー選択。タイトルのリンクだけは伝播を止めてページ遷移にする。
    <div
      role="button"
      tabIndex={0}
      className={`list-group-item list-group-item-action text-start ${selected ? 'active' : ''}`}
      onClick={() => onSelect(hit.pageId)}
      onKeyDown={handleKeyDown}
    >
      <a
        href={`/${hit.pageId}`}
        className="grw-and-search-title fw-bold text-truncate d-block"
        onClick={handleTitleClick}
        title="クリックでページを開く（Ctrl/⌘クリックで別タブ）"
      >
        {hit.title}
      </a>
      <div className="small text-truncate opacity-75">{hit.path}</div>
      <div className="small d-flex gap-2 opacity-75">
        <span><span className="material-symbols-outlined align-middle fs-6" aria-hidden="true">person</span>{hit.creatorName}</span>
        <span><span className="material-symbols-outlined align-middle fs-6" aria-hidden="true">visibility</span>{hit.seenUserCount}</span>
        <span><span className="material-symbols-outlined align-middle fs-6" aria-hidden="true">update</span>{formatDate(hit.updatedAt)}</span>
      </div>
      {hit.snippets.length > 0 && (
        <div
          className="small mt-1 grw-plugin-and-search-snippet"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: hit.snippets.join(' … ') }}
        />
      )}
    </div>
  );
}
