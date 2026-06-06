import { describe, it, expect, afterEach } from 'vitest';
import { buildDefaultRendererConfig, resolveRendererConfig } from './markdownRenderer';

afterEach(() => {
  // 各テスト後に __NEXT_DATA__ を片付ける
  delete (window as any).__NEXT_DATA__;
});

describe('buildDefaultRendererConfig', () => {
  it('サニタイズはON・推奨ホワイトリストの既定を返す', () => {
    const cfg = buildDefaultRendererConfig();
    expect(cfg.isEnabledXssPrevention).toBe(true);
    expect(cfg.sanitizeType).toBe('Recommended');
  });

  it('drawio/plantuml の既定URIを含む', () => {
    const cfg = buildDefaultRendererConfig();
    expect(cfg.drawioUri).toBe('https://embed.diagrams.net/');
    expect(cfg.plantumlUri).toBe('https://www.plantuml.com/plantuml');
  });

  it('generateViewOptions が参照する全フィールドを持つ', () => {
    const cfg = buildDefaultRendererConfig();
    for (const key of [
      'plantumlUri', 'isEnabledLinebreaks', 'isEnabledXssPrevention',
      'sanitizeType', 'customTagWhitelist', 'customAttrWhitelist',
      'isSharedPage', 'isDarkMode',
    ]) {
      expect(cfg).toHaveProperty(key);
    }
  });
});

describe('resolveRendererConfig', () => {
  it('__NEXT_DATA__ に rendererConfig があればそれを優先する', () => {
    const real = { isEnabledXssPrevention: true, sanitizeType: 'Recommended', drawioUri: 'https://my-drawio.example/' };
    (window as any).__NEXT_DATA__ = { props: { pageProps: { rendererConfig: real } } };
    expect(resolveRendererConfig()).toBe(real);
  });

  it('__NEXT_DATA__ に無ければ既定値で構築する', () => {
    (window as any).__NEXT_DATA__ = { props: { pageProps: {} } };
    const cfg = resolveRendererConfig();
    expect(cfg.drawioUri).toBe('https://embed.diagrams.net/');
    expect(cfg.sanitizeType).toBe('Recommended');
  });

  it('__NEXT_DATA__ 自体が無くても既定値を返す', () => {
    const cfg = resolveRendererConfig();
    expect(cfg.isEnabledXssPrevention).toBe(true);
  });
});
