import { createRoot, type Root } from 'react-dom/client';
import { AndSearchModalContainer } from './src/components/AndSearchModalContainer';
import type { PluginRegistration } from './src/hub-types';

const PLUGIN_NAME = 'growi-plugin-and-search';
const MODAL_MOUNT_ID = 'growi-plugin-and-search-modal-mount';
const STYLE_ID = 'growi-plugin-and-search-styles';

let modalRoot: Root | null = null;

/**
 * プラグイン専用のスタイルを一度だけ注入する。
 * タイトル（リンク）は色を変えず本文色（黒）で固定し、ホバー時に下線のみ出す。
 * プレビュー用のカード本体（Bootstrap の list-group-item-action のグレーのホバー）と
 * 操作の境目を明確にする。選択中カードでもタイトルは黒のまま（白に反転しない）。
 */
function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.grw-and-search-title {
  color: var(--bs-body-color, #212529) !important;
  text-decoration: none;
  cursor: pointer;
}
.grw-and-search-title:hover,
.grw-and-search-title:focus-visible {
  text-decoration: underline !important;
}
/* 選択中(active)カードや各種ホバー状態でも、タイトルの色は本文色のまま（白に反転させない） */
.list-group-item.active .grw-and-search-title,
.list-group-item.active .grw-and-search-title:hover,
.list-group-item.active .grw-and-search-title:focus,
.list-group-item.active .grw-and-search-title:focus-visible,
.list-group-item-action:hover .grw-and-search-title,
.list-group-item-action:focus .grw-and-search-title {
  color: var(--bs-body-color, #212529) !important;
}
.list-group-item.active .grw-and-search-title:hover,
.list-group-item.active .grw-and-search-title:focus-visible {
  text-decoration: underline !important;
}
`;
  document.head.appendChild(style);
}

function registerToHub(plugin: PluginRegistration): void {
  const hub = (window as any).growiPluginHub;
  if (hub?.register) {
    hub.register(plugin);
  } else {
    (window as any).growiPluginHub ??= { _queue: [] };
    (window as any).growiPluginHub._queue.push(plugin);
  }
}

function ensureModalMount(): Root {
  if (modalRoot) {
    const el = document.getElementById(MODAL_MOUNT_ID);
    if (el && document.body.contains(el)) return modalRoot;
    modalRoot.unmount();
    modalRoot = null;
  }
  let el = document.getElementById(MODAL_MOUNT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = MODAL_MOUNT_ID;
    document.body.appendChild(el);
  }
  modalRoot = createRoot(el);
  return modalRoot;
}

function openModal(): void {
  const hub = (window as any).growiPluginHub;
  hub?.log?.(PLUGIN_NAME, 'open AND search modal');
  ensureStyles();
  const root = ensureModalMount();
  root.render(<AndSearchModalContainer onClose={() => root.render(null)} />);
}

function cleanupModal(): void {
  modalRoot?.unmount();
  modalRoot = null;
  document.getElementById(MODAL_MOUNT_ID)?.remove();
}

function activate(): void {
  registerToHub({
    id: PLUGIN_NAME,
    label: 'AND検索',
    icon: 'search',
    order: 20,
    onAction: () => openModal(),
    onPageChange: (ctx) => {
      if (ctx.mode === 'edit') cleanupModal();
    },
    onDisable: () => cleanupModal(),
  });
}

function deactivate(): void {
  cleanupModal();
  (window as any).growiPluginHub?.unregister(PLUGIN_NAME);
}

if ((window as any).pluginActivators == null) {
  (window as any).pluginActivators = {};
}
(window as any).pluginActivators[PLUGIN_NAME] = { activate, deactivate };
