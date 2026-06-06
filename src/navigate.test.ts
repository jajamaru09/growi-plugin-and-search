import { describe, it, expect, afterEach } from 'vitest';
import { spaNavigateToPage } from './navigate';

afterEach(() => {
  delete (window as any).next;
});

describe('spaNavigateToPage', () => {
  it('window.next.router.push があれば /{pageId} へpushしてtrueを返す', () => {
    const calls: string[] = [];
    (window as any).next = { router: { push: (url: string) => { calls.push(url); } } };
    const result = spaNavigateToPage('abc123');
    expect(result).toBe(true);
    expect(calls).toEqual(['/abc123']);
  });

  it('router が無ければ false を返す（フォールバック）', () => {
    expect(spaNavigateToPage('abc123')).toBe(false);
  });

  it('push が関数でなければ false を返す', () => {
    (window as any).next = { router: { push: 'not-a-function' } };
    expect(spaNavigateToPage('abc123')).toBe(false);
  });
});
