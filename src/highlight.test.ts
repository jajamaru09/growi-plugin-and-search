import { describe, it, expect } from 'vitest';
import { highlightTerms } from './highlight';

function makeRoot(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('highlightTerms', () => {
  it('一致する語を <mark> で囲む', () => {
    const root = makeRoot('<p>hello func world</p>');
    highlightTerms(root, ['func']);
    const marks = root.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('func');
  });

  it('複数語・複数出現をすべて囲む', () => {
    const root = makeRoot('<p>foo bar foo</p><div>bar</div>');
    highlightTerms(root, ['foo', 'bar']);
    expect(root.querySelectorAll('mark').length).toBe(4);
  });

  it('大文字小文字を区別しない', () => {
    const root = makeRoot('<p>Hello HELLO hello</p>');
    highlightTerms(root, ['hello']);
    expect(root.querySelectorAll('mark').length).toBe(3);
  });

  it('script/style は対象外', () => {
    const root = makeRoot('<style>foo{}</style><script>foo</script><p>foo</p>');
    highlightTerms(root, ['foo']);
    expect(root.querySelectorAll('mark').length).toBe(1);
  });

  it('drawio コンテナ内はスキップする', () => {
    const root = makeRoot('<div class="drawio-container">foo</div><p>foo</p>');
    highlightTerms(root, ['foo']);
    expect(root.querySelectorAll('mark').length).toBe(1);
  });

  it('語が無ければ何もしない', () => {
    const root = makeRoot('<p>hello</p>');
    highlightTerms(root, []);
    expect(root.querySelectorAll('mark').length).toBe(0);
    expect(root.textContent).toBe('hello');
  });

  it('正規表現の特殊文字を含む語もリテラル一致する', () => {
    const root = makeRoot('<p>a.b a+b</p>');
    highlightTerms(root, ['a.b']);
    const marks = root.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('a.b');
  });
});
