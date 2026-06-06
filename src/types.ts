/** 1ワード分の検索進捗（UIの進捗バー用） */
export interface SearchProgress {
  word: string;
  total: number;    // 2系統合算のヒット総数（バーの分母）
  fetched: number;  // 2系統合算の取得済みヒット数（バーの分子）
  capped: boolean;  // total > 10000 で全件取得できないワード
  done: boolean;    // そのワードの取得が完了したか
  // 取得件数の内訳（「xx＋yy」表示用）。完全一致(フレーズ)検索 と 通常検索 の2系統。
  phraseFetched: number; // 完全一致(フレーズ)検索で取得した件数
  rawFetched: number;    // 通常検索で取得した件数
}

/** 検索APIの1ヒットから抽出した、表示に必要な最小データ */
export interface RawHit {
  pageId: string;
  path: string;
  creatorName: string;
  createdAt: number;     // epoch ms
  updatedAt: number;     // epoch ms
  seenUserCount: number;
  snippet: string | null; // ハイライト済みHTML断片（そのワードの分）
}

/** AND積集合後の1ページ（複数ワードのスニペットをマージ済み） */
export interface PageSearchHit {
  pageId: string;
  path: string;
  title: string;          // path末尾（GROWIにタイトル概念が無いため導出）
  creatorName: string;
  createdAt: number;
  updatedAt: number;
  seenUserCount: number;
  snippets: string[];     // 各ワードのハイライト断片をマージ
}

export type SortKey = 'updatedAt' | 'createdAt' | 'seenUserCount';
export type SortOrder = 'asc' | 'desc';
