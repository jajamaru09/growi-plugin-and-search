/**
 * プレビュー DOM 内のテキストから検索ワードに一致する箇所を <mark> で囲む。
 * - 大文字小文字を区別しない部分一致（日本語に語境界が無いため substring 一致）
 * - script/style/textarea/既存のmark、および drawio 図（.drawio-container/.mxgraph）内はスキップ
 * - innerHTML 置換直後に呼ぶ前提（再適用で多重 <mark> にならないようスキップ済み）
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'MARK']);

export function highlightTerms(root: HTMLElement, words: string[]): void {
  const terms = words.map((w) => w.trim()).filter((w) => w.length > 0);
  if (terms.length === 0) return;

  const pattern = new RegExp(terms.map(escapeRegExp).join('|'), 'gi');

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (parent == null) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.drawio-container, .mxgraph')) return NodeFilter.FILTER_REJECT;
      const value = node.nodeValue;
      if (value == null || value.trim() === '') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  // 走査中に DOM を変更しないよう、対象テキストノードを先に集める
  const targets: Text[] = [];
  let n: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((n = walker.nextNode())) {
    pattern.lastIndex = 0;
    if (pattern.test((n as Text).nodeValue ?? '')) targets.push(n as Text);
  }

  for (const textNode of targets) {
    const value = textNode.nodeValue ?? '';
    const frag = document.createDocumentFragment();
    let last = 0;
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = pattern.exec(value)) !== null) {
      if (m[0].length === 0) {
        pattern.lastIndex++;
        continue;
      }
      const start = m.index;
      const end = start + m[0].length;
      if (start > last) {
        frag.appendChild(document.createTextNode(value.slice(last, start)));
      }
      const mark = document.createElement('mark');
      mark.className = 'grw-and-search-hl';
      mark.textContent = value.slice(start, end);
      frag.appendChild(mark);
      last = end;
    }
    if (last < value.length) {
      frag.appendChild(document.createTextNode(value.slice(last)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}
