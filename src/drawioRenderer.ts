/**
 * DrawIO rendering utility for diff comparison modal
 * Uses Growi's global GraphViewer when available, falls back to showing encoded data
 */

const DRAWIO_RENDERED_ATTR = 'data-drawio-rendered';

export interface DrawIOViewerResult {
  graph: any;
  cells: Record<string, any>;
  container: HTMLElement;
}

/**
 * Initialize DrawIO viewers within a container element.
 * Finds all .drawio-container elements and renders them using GraphViewer
 * or falls back to displaying the encoded data as text.
 * Already-rendered containers are skipped to prevent double rendering.
 *
 * When onViewerReady is provided, it is called for each container
 * after GraphViewer finishes rendering, with the graph instance and model cells.
 */
export function initializeDrawIOViewer(
  container: HTMLElement,
  onViewerReady?: (result: DrawIOViewerResult) => void,
): void {
  const drawioContainers = container.querySelectorAll<HTMLElement>(
    `.drawio-container:not([${DRAWIO_RENDERED_ATTR}])`,
  );

  drawioContainers.forEach((el) => {
    const encodedData = el.dataset.drawioXml;
    if (!encodedData) return;

    // Mark as rendered to prevent double processing
    el.setAttribute(DRAWIO_RENDERED_ATTR, 'true');

    // Clear any existing content
    el.textContent = '';

    if (typeof (window as any).GraphViewer?.createViewerForElement === 'function') {
      // Wrap encoded data in mxfile XML structure (matching Growi's format)
      const mxfileXml = `\n    <mxfile version="6.8.9" editor="www.draw.io" type="atlas">\n      <mxAtlasLibraries/>\n      <diagram>${encodedData}</diagram>\n    </mxfile>\n  `;
      const mxDiv = document.createElement('div');
      mxDiv.className = 'mxgraph';
      mxDiv.dataset.mxgraph = JSON.stringify({
        editable: false,
        highlight: '#0000ff',
        nav: false,
        toolbar: null,
        edit: null,
        resize: true,
        lightbox: 'false',
        xml: mxfileXml,
      });
      el.appendChild(mxDiv);
      try {
        (window as any).GraphViewer.createViewerForElement(mxDiv, (viewer: any) => {
          if (onViewerReady && viewer.graph) {
            const model = viewer.graph.getModel();
            onViewerReady({
              graph: viewer.graph,
              cells: model.cells,
              container: el,
            });
          }
        });
      } catch {
        // GraphViewer failed — fall back to text display
        el.textContent = '';
        renderFallback(el, encodedData);
      }
    } else {
      renderFallback(el, encodedData);
    }
  });
}

function renderFallback(container: HTMLElement, encodedData: string): void {
  const pre = document.createElement('pre');
  pre.className = 'drawio-fallback';
  pre.textContent = encodedData;
  container.appendChild(pre);
}
