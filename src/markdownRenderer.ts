import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Element, Text, Root } from 'hast';

// ---------------------------------------------------------------------------
// GROWI facade config retrieval
// ---------------------------------------------------------------------------

interface RendererOptions {
  remarkPlugins: Array<any>;
  rehypePlugins: Array<any>;
  remarkRehypeOptions?: Record<string, unknown>;
}

let cachedOpts: RendererOptions | null = null;

/**
 * generateViewOptions が rendererConfig から実際に参照するフィールドのみを、
 * GROWI の既定値で構築する。
 *
 * GROWI 7.5+ では rendererConfig が __NEXT_DATA__.props.pageProps に載らず
 * Jotai atom にハイドレートされ、外部プラグインから読めない。そのため
 * __NEXT_DATA__ から取得できない環境では本既定値にフォールバックする。
 * isEnabledXssPrevention=true / sanitizeType='Recommended' を維持し、
 * GROWI 本体と同じ推奨ホワイトリストでサニタイズされる。
 */
export function buildDefaultRendererConfig(): Record<string, unknown> {
  return {
    plantumlUri: 'https://www.plantuml.com/plantuml',
    drawioUri: 'https://embed.diagrams.net/',
    isEnabledLinebreaks: false,
    isEnabledLinebreaksInComments: false,
    isEnabledMarp: false,
    adminPreferredIndentSize: 4,
    isIndentSizeForced: false,
    highlightJsStyleBorder: false,
    isEnabledXssPrevention: true,
    sanitizeType: 'Recommended',
    customTagWhitelist: [],
    customAttrWhitelist: {},
    isDarkMode:
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-bs-theme') === 'dark',
    isSharedPage:
      typeof location !== 'undefined' &&
      location.pathname.startsWith('/share/'),
  };
}

/**
 * rendererConfig を解決する。__NEXT_DATA__ にあればそれを優先し
 * （カスタム drawioUri 等を尊重）、無ければ既定値で構築する。
 */
export function resolveRendererConfig(): Record<string, unknown> {
  const fromNext = (window as any).__NEXT_DATA__?.props?.pageProps?.rendererConfig;
  return fromNext ?? buildDefaultRendererConfig();
}

function getGrowiRendererOptions(): RendererOptions {
  if (cachedOpts) return cachedOpts;
  const facade = (window as any).growiFacade;
  const gen = facade?.markdownRenderer?.optionsGenerators?.customGenerateViewOptions
           ?? facade?.markdownRenderer?.optionsGenerators?.generateViewOptions;
  if (!gen) {
    throw new Error('GROWI renderer not available');
  }
  const config = resolveRendererConfig();
  const opts = gen('/', config, () => {}) as RendererOptions;
  cachedOpts = opts;
  return opts;
}

// ---------------------------------------------------------------------------
// rehypeCustomElements — convert HAST custom elements to standard HTML
// ---------------------------------------------------------------------------

const CALLOUT_ICONS: Record<string, string> = {
  note: 'info',
  info: 'info',
  tip: 'lightbulb',
  important: 'priority_high',
  warning: 'warning',
  danger: 'error',
  caution: 'error',
};

/** Extract concatenated text content from a HAST node tree. */
function extractText(node: Element | Text): string {
  if (node.type === 'text') return (node as Text).value;
  if ('children' in node) {
    return (node as Element).children.map((c) => extractText(c as Element | Text)).join('');
  }
  return '';
}

/**
 * Parse an HTML string from Prism.highlight() into HAST children.
 * Uses a temporary <template> element to avoid full document parsing.
 */
function htmlToHastChildren(html: string): Array<Element | Text> {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const children: Array<Element | Text> = [];

  function convert(domNode: Node): Element | Text | null {
    if (domNode.nodeType === Node.TEXT_NODE) {
      return { type: 'text', value: domNode.textContent ?? '' };
    }
    if (domNode.nodeType === Node.ELEMENT_NODE) {
      const el = domNode as HTMLElement;
      const props: Record<string, any> = {};
      if (el.className) props.className = el.className.split(' ');
      const hastChildren: Array<Element | Text> = [];
      for (const child of Array.from(el.childNodes)) {
        const c = convert(child);
        if (c) hastChildren.push(c);
      }
      return {
        type: 'element',
        tagName: el.tagName.toLowerCase(),
        properties: props,
        children: hastChildren,
      };
    }
    return null;
  }

  for (const child of Array.from(tpl.content.childNodes)) {
    const c = convert(child);
    if (c) children.push(c);
  }
  return children;
}

/**
 * Rehype plugin that converts custom HAST elements to standard HTML.
 * - <callout> → div.callout with indicator, icon, title, content
 * - <drawio> → div.drawio-container with data-drawio-xml
 * - <code class="language-xxx"> → Prism syntax highlighted spans
 */
function rehypeCustomElements(markdownSource: string) {
  const lines = markdownSource.split('\n');
  return () => (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      // --- Callout conversion ---
      if (node.tagName === 'callout') {
        const type = (String(node.properties?.type || 'note')).toLowerCase();
        const label = String(node.properties?.label || type.charAt(0).toUpperCase() + type.slice(1));
        const originalChildren = node.children;
        node.tagName = 'div';
        node.properties = { className: ['callout', `callout-${type}`] };
        node.children = [
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['callout-indicator'] },
            children: [
              {
                type: 'element',
                tagName: 'div',
                properties: { className: ['callout-hint'] },
                children: [
                  {
                    type: 'element',
                    tagName: 'span',
                    properties: { className: ['material-symbols-outlined'] },
                    children: [{ type: 'text', value: CALLOUT_ICONS[type] || 'info' }],
                  },
                ],
              },
              {
                type: 'element',
                tagName: 'span',
                properties: { className: ['callout-title'] },
                children: [{ type: 'text', value: label }],
              },
            ],
          },
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['callout-content'] },
            children: originalChildren,
          },
        ];
      }

      // --- DrawIO conversion ---
      if (node.tagName === 'drawio') {
        const bol = parseInt(String(node.properties?.bol), 10);
        const eol = parseInt(String(node.properties?.eol), 10);
        let xml = '';
        if (!isNaN(bol) && !isNaN(eol)) {
          xml = lines.slice(bol, eol).join('\n').trim();
          // Strip code fence markers (```drawio and ```)
          if (xml.startsWith('```')) xml = xml.split('\n').slice(1).join('\n');
          if (xml.endsWith('```')) xml = xml.slice(0, xml.lastIndexOf('```')).trim();
        }
        node.tagName = 'div';
        node.properties = { className: ['drawio-container'], 'data-drawio-xml': xml };
        node.children = [];
      }

      // --- Syntax highlighting ---
      // Detect <pre> containing a <code> with language info
      if (node.tagName === 'pre') {
        const codeChild = node.children.find(
          (c): c is Element => c.type === 'element' && c.tagName === 'code',
        );
        if (!codeChild) return;

        // Detect language from data-lang or className
        let lang = '';
        const dataLang = codeChild.properties?.dataLang ?? codeChild.properties?.['data-lang'];
        if (dataLang) {
          lang = String(dataLang);
        } else if (Array.isArray(codeChild.properties?.className)) {
          const langClass = (codeChild.properties.className as string[]).find(
            (c: string) => typeof c === 'string' && c.startsWith('language-'),
          );
          if (langClass) lang = langClass.replace('language-', '');
        }

        if (!lang) return;

        // Apply Prism highlighting
        const Prism = (window as any).Prism;
        if (Prism?.languages?.[lang]) {
          const text = extractText(codeChild);
          const highlighted = Prism.highlight(text, Prism.languages[lang], lang);
          codeChild.children = htmlToHastChildren(highlighted);
        }

        // Set language class on <pre> and <code>
        // Include cbs-theme-light on <pre> so Prism token colors apply
        const langClass = `language-${lang}`;
        codeChild.properties!.className = [langClass];
        node.properties!.className = [langClass, 'cbs-theme-light'];
      }
    });
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function renderMarkdown(markdown: string): Promise<string> {
  const opts = getGrowiRendererOptions();

  const processor = unified().use(remarkParse);

  // Inject GROWI's remark plugins
  for (const p of opts.remarkPlugins) {
    if (Array.isArray(p)) {
      processor.use(p[0], p[1]);
    } else {
      processor.use(p);
    }
  }

  processor.use(remarkRehype, opts.remarkRehypeOptions ?? {});

  // Inject GROWI's rehype plugins (skip TOC generator — last plugin)
  // The TOC plugin is identified by position (always last) and verified by
  // checking for 'storeTocNode' in the source. If the heuristic fails,
  // degradation is graceful: an unused TOC node is generated with no side effects.
  const rehypePlugins = opts.rehypePlugins;
  const lastIdx = rehypePlugins.length - 1;
  for (let i = 0; i < rehypePlugins.length; i++) {
    const p = rehypePlugins[i];
    const fn = Array.isArray(p) ? p[0] : p;
    if (i === lastIdx && fn.toString().includes('storeTocNode')) continue;
    if (Array.isArray(p)) {
      processor.use(p[0], p[1]);
    } else {
      processor.use(p);
    }
  }

  // Convert custom elements and apply syntax highlighting
  processor.use(rehypeCustomElements(markdown));

  processor.use(rehypeStringify);

  const result = await processor.process(markdown);
  return String(result);
}
