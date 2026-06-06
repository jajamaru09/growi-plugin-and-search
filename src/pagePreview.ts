import { renderMarkdown } from './markdownRenderer.ts';
import { initializeDrawIOViewer } from './drawioRenderer.ts';
import { highlightTerms } from './highlight.ts';

const PLUGIN_NAME = 'growi-plugin-and-search';
const bodyCache = new Map<string, string>();

function log(...args: unknown[]): void {
  const hub = (window as any).growiPluginHub;
  if (hub?.log) hub.log(PLUGIN_NAME, ...args);
  else console.log(`[${PLUGIN_NAME}]`, ...args);
}

/** ページ本文 markdown を取得（セッション内キャッシュ） */
export async function fetchPageBody(pageId: string, signal?: AbortSignal): Promise<string> {
  const cached = bodyCache.get(pageId);
  if (cached !== undefined) return cached;

  const res = await fetch(`/_api/v3/page?pageId=${encodeURIComponent(pageId)}`, { signal });
  if (!res.ok) throw new Error(`GROWI page API error: ${res.status}`);
  const json = await res.json();
  const body: string = json?.page?.revision?.body ?? '';
  bodyCache.set(pageId, body);
  return body;
}

/**
 * pageId の本文を target 要素に GROWI 同等レンダリングで描画する。
 * markdown→HTML 後に drawio ビューアを初期化する。
 */
export async function renderPagePreview(
  pageId: string,
  target: HTMLElement,
  signal?: AbortSignal,
  highlightWords?: string[],
): Promise<void> {
  const body = await fetchPageBody(pageId, signal);
  if (signal?.aborted) return;
  const html = await renderMarkdown(body);
  if (signal?.aborted) return;
  target.innerHTML = html;
  try {
    initializeDrawIOViewer(target);
  } catch (e) {
    log('drawio init failed (non-fatal):', e);
  }
  if (highlightWords && highlightWords.length > 0) {
    try {
      highlightTerms(target, highlightWords);
    } catch (e) {
      log('highlight failed (non-fatal):', e);
    }
  }
}

export function clearPreviewCache(): void {
  bodyCache.clear();
}
