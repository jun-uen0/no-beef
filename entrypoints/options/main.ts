// Plain TypeScript options page (no framework). Loads/saves NoBeefConfig
// via chrome.storage.sync (accessed through WXT's typed `browser` binding,
// since this project has no @types/chrome dependency), keyed by
// CONFIG_STORAGE_KEY, and saves on every change (no explicit "save" button).
import { browser } from 'wxt/browser';
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, type NoBeefConfig } from '../../src/core/config';
import {
  downloadGeminiNano,
  GEMINI_NANO_DOWNLOAD_STALLED,
  geminiNanoAvailability,
} from '../../src/adapters/classifier/gemini-nano/gemini-nano-classifier';

function requireElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

const enabledInput = requireElement<HTMLInputElement>('enabled');
const modeRevealFirstInput = requireElement<HTMLInputElement>('mode-reveal-first');
const modeCoverFirstInput = requireElement<HTMLInputElement>('mode-cover-first');
const harmfulThresholdInput = requireElement<HTMLInputElement>('harmfulThreshold');
const mildThresholdInput = requireElement<HTMLInputElement>('mildThreshold');
const bridgeNativeInput = requireElement<HTMLInputElement>('bridge-native');
const harmfulThresholdValue = requireElement<HTMLElement>('harmfulThreshold-value');
const mildThresholdValue = requireElement<HTMLElement>('mildThreshold-value');
const statusEl = requireElement<HTMLElement>('status');
const nanoStatusEl = requireElement<HTMLElement>('nano-status');
const nanoDownloadButton = requireElement<HTMLButtonElement>('nano-download');
const nanoRequirementsEl = requireElement<HTMLElement>('nano-requirements');

let statusTimer: ReturnType<typeof setTimeout> | undefined;

/** Push a config into the form controls (used on initial load). */
function applyConfigToForm(config: NoBeefConfig): void {
  enabledInput.checked = config.enabled;
  modeRevealFirstInput.checked = config.mode === 'reveal-first';
  modeCoverFirstInput.checked = config.mode === 'cover-first';
  harmfulThresholdInput.value = String(config.harmfulThreshold);
  mildThresholdInput.value = String(config.mildThreshold);
  bridgeNativeInput.checked = config.bridge === 'native';
  updateThresholdLabels();
}

/** Read the current form state back into a NoBeefConfig. */
function readConfigFromForm(): NoBeefConfig {
  return {
    enabled: enabledInput.checked,
    mode: modeCoverFirstInput.checked ? 'cover-first' : 'reveal-first',
    harmfulThreshold: Number(harmfulThresholdInput.value),
    mildThreshold: Number(mildThresholdInput.value),
    bridge: bridgeNativeInput.checked ? 'native' : 'builtin',
  };
}

/** Keep the numeric labels next to each slider in sync with its value. */
function updateThresholdLabels(): void {
  harmfulThresholdValue.textContent = Number(harmfulThresholdInput.value).toFixed(2);
  mildThresholdValue.textContent = Number(mildThresholdInput.value).toFixed(2);
}

function flashSaved(): void {
  statusEl.textContent = '保存しました';
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.textContent = '';
  }, 1500);
}

async function loadConfig(): Promise<NoBeefConfig> {
  const stored = await browser.storage.sync.get(CONFIG_STORAGE_KEY);
  const value = stored[CONFIG_STORAGE_KEY] as NoBeefConfig | undefined;
  return value ?? DEFAULT_CONFIG;
}

async function saveConfig(config: NoBeefConfig): Promise<void> {
  await browser.storage.sync.set({ [CONFIG_STORAGE_KEY]: config });
  flashSaved();
}

function onFormChange(): void {
  updateThresholdLabels();
  void saveConfig(readConfigFromForm());
}

/**
 * Stage 3 stays off until the built-in model is actually present, and pulling
 * it down is several gigabytes — so this section reports the state and lets the
 * user start the download, rather than the extension starting it unasked.
 */
async function refreshNanoStatus(): Promise<void> {
  const availability = await geminiNanoAvailability();

  nanoDownloadButton.hidden = availability !== 'downloadable';
  nanoRequirementsEl.hidden = availability !== 'unavailable';

  switch (availability) {
    case 'available':
      nanoStatusEl.textContent = '利用できます。疑わしい投稿は端末内のAIで判定されます。';
      break;
    case 'downloadable':
      nanoStatusEl.textContent = 'この端末で使えますが、先にモデルのダウンロードが必要です。';
      break;
    case 'downloading':
      nanoStatusEl.textContent = 'モデルをダウンロードしています。完了すると自動で有効になります。';
      break;
    case 'unavailable':
      nanoStatusEl.textContent = 'この端末では使えません。語彙と分類器による判定だけが動きます。';
      break;
  }
}

async function onNanoDownloadClick(): Promise<void> {
  nanoDownloadButton.disabled = true;
  nanoDownloadButton.hidden = true;
  nanoStatusEl.textContent = 'ダウンロードを開始しています…';

  try {
    await downloadGeminiNano((loaded) => {
      // The fraction reaches 1 before the model finishes loading into memory,
      // so the last stretch deliberately stops reporting a number.
      nanoStatusEl.textContent =
        loaded >= 1
          ? 'ダウンロードが完了しました。モデルを読み込んでいます…'
          : `ダウンロード中… ${Math.round(loaded * 100)}%`;
    });
  } catch (err) {
    nanoStatusEl.textContent =
      String((err as { message?: unknown })?.message ?? err).includes(GEMINI_NANO_DOWNLOAD_STALLED)
        ? 'ダウンロードが始まりませんでした。ブラウザがモデルを取得できない状態か、回線が塞がっている可能性があります。'
        : 'ダウンロードに失敗しました。時間をおいて試してください。';
  } finally {
    nanoDownloadButton.disabled = false;
  }

  await refreshNanoStatus();
}

async function init(): Promise<void> {
  applyConfigToForm(await loadConfig());

  enabledInput.addEventListener('change', onFormChange);
  modeRevealFirstInput.addEventListener('change', onFormChange);
  modeCoverFirstInput.addEventListener('change', onFormChange);
  harmfulThresholdInput.addEventListener('input', onFormChange);
  mildThresholdInput.addEventListener('input', onFormChange);
  bridgeNativeInput.addEventListener('change', onFormChange);
  nanoDownloadButton.addEventListener('click', () => void onNanoDownloadClick());

  await refreshNanoStatus();
}

void init();
