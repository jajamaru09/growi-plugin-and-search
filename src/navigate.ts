/**
 * GROWI ネイティブ検索と同じ方式（Next.js Pages Router の router.push）で
 * ページへ SPA 遷移する。Next.js ランタイムが公開する window.next.router を使う。
 *
 * 成功したら true を返す（呼び出し側はモーダルを閉じる）。
 * router が利用できない環境では false を返し、呼び出し側は <a href> による
 * フルリロード遷移にフォールバックする。
 */
export function spaNavigateToPage(pageId: string): boolean {
  const router = (window as any).next?.router;
  if (typeof router?.push === 'function') {
    router.push(`/${pageId}`);
    return true;
  }
  return false;
}
