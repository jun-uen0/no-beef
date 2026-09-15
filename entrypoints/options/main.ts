// Plain TypeScript options page (no framework). Loads/saves NoBeefConfig
// via chrome.storage.sync (accessed through WXT's typed `browser` binding,
// since this project has no @types/chrome dependency), keyed by
// CONFIG_STORAGE_KEY, and saves on every change (no explicit "save" button).
import { browser } from 'wxt/browser';
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, type NoBeefConfig } from '../../src/core/config';

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
const harmfulThresholdValue = requireElement<HTMLElement>('harmfulThreshold-value');
const mildThresholdValue = requireElement<HTMLElement>('mildThreshold-value');
const statusEl = requireElement<HTMLElement>('status');

let statusTimer: ReturnType<typeof setTimeout> | undefined;

/** Push a config into the form controls (used on initial load). */
function applyConfigToForm(config: NoBeefConfig): void {
  enabledInput.checked = config.enabled;
  modeRevealFirstInput.checked = config.mode === 'reveal-first';
  modeCoverFirstInput.checked = config.mode === 'cover-first';
  harmfulThresholdInput.value = String(config.harmfulThreshold);
  mildThresholdInput.value = String(config.mildThreshold);
  updateThresholdLabels();
}

/** Read the current form state back into a NoBeefConfig. */
function readConfigFromForm(): NoBeefConfig {
  return {
    enabled: enabledInput.checked,
    mode: modeCoverFirstInput.checked ? 'cover-first' : 'reveal-first',
    harmfulThreshold: Number(harmfulThresholdInput.value),
    mildThreshold: Number(mildThresholdInput.value),
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

async function init(): Promise<void> {
  applyConfigToForm(await loadConfig());

  enabledInput.addEventListener('change', onFormChange);
  modeRevealFirstInput.addEventListener('change', onFormChange);
  modeCoverFirstInput.addEventListener('change', onFormChange);
  harmfulThresholdInput.addEventListener('input', onFormChange);
  mildThresholdInput.addEventListener('input', onFormChange);
}

void init();
