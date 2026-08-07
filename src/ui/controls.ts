import {
  DEFAULT_STATE,
  EXPORT_PRESETS,
  MAX_RAMP_STOPS,
  MIN_RAMP_STOPS,
  type ControlState,
  type Rgb,
} from "../types";
import { exportPreset } from "../export/downloadPng";
import {
  dataUrlToImageBitmap,
  deletePreset,
  fileToDataUrl,
  getInitialSession,
  loadPresetList,
  loadSession,
  savePresetList,
  saveSession,
  upsertPreset,
  type SavedPreset,
  type StoredSession,
} from "../presets/storage";
import { hexToRgb, rgbToHex, type Renderer } from "../webgl/Renderer";

interface ControlsOptions {
  panel: HTMLElement;
  renderer: Renderer;
  onChange: (state: ControlState) => void;
}

interface RangeConfig {
  key: keyof ControlState;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  help?: string;
}

interface ToastAction {
  label: string;
  onClick: () => void;
}

const GRID_PRIMARY_CONTROLS: RangeConfig[] = [
  { key: "cols", label: "Grid columns", min: 4, max: 80, step: 1 },
  { key: "rows", label: "Grid rows", min: 4, max: 80, step: 1 },
  {
    key: "minRadius",
    label: "Min dot radius",
    min: 0.001,
    max: 0.08,
    step: 0.001,
    format: (v) => v.toFixed(3),
  },
  {
    key: "maxRadius",
    label: "Max dot radius",
    min: 0.01,
    max: 0.15,
    step: 0.001,
    format: (v) => v.toFixed(3),
  },
  {
    key: "threshold",
    label: "Merge threshold",
    min: 0.2,
    max: 3.0,
    step: 0.05,
    format: (v) => v.toFixed(2),
    help: "Lower values merge nearby dots more aggressively.",
  },
];

const ADVANCED_CONTROLS: RangeConfig[] = [
  {
    key: "softness",
    label: "Softness",
    min: 0.0001,
    max: 0.01,
    step: 0.0001,
    format: (v) => v.toFixed(4),
    help: "Controls metaball falloff sharpness.",
  },
  {
    key: "edge",
    label: "Edge smoothness",
    min: 0.01,
    max: 0.5,
    step: 0.01,
    format: (v) => v.toFixed(2),
    help: "Anti-aliasing width at blob edges.",
  },
  {
    key: "colorRange",
    label: "Color spread",
    min: 0.3,
    max: 4.0,
    step: 0.1,
    format: (v) => v.toFixed(1),
    help: "How far inward the ramp transitions from edge to core.",
  },
  {
    key: "contourBands",
    label: "Contour bands",
    min: 1,
    max: 12,
    step: 1,
    format: (v) => String(Math.round(v)),
    help: "1 = smooth gradient; 4+ = stepped isocontour banding.",
  },
];

const ALL_RANGE_CONTROLS = [...GRID_PRIMARY_CONTROLS, ...ADVANCED_CONTROLS];

const TOAST_DURATION_MS = 3500;

function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function rampGradient(colors: Rgb[]): string {
  if (colors.length === 0) return "transparent";
  if (colors.length === 1) return rgbToHex(colors[0]);

  const stops = colors.map((color, index) => {
    const percent = (index / (colors.length - 1)) * 100;
    return `${rgbToHex(color)} ${percent}%`;
  });

  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function stopLabel(index: number, total: number): string {
  if (index === 0) return "Edge";
  if (index === total - 1) return "Core";
  return `Mid ${index}`;
}

function showToast(message: string, action?: ToastAction): void {
  const toast = document.querySelector<HTMLElement>("#toast");
  const messageEl = toast?.querySelector<HTMLElement>(".toast-message");
  const actionEl = toast?.querySelector<HTMLButtonElement>(".toast-action");
  if (!toast || !messageEl || !actionEl) return;

  messageEl.textContent = message;
  toast.hidden = false;
  toast.classList.remove("is-visible");
  void toast.offsetWidth;
  toast.classList.add("is-visible");

  const clearAction = () => {
    actionEl.hidden = true;
    actionEl.onclick = null;
    actionEl.textContent = "";
  };

  if (action) {
    actionEl.hidden = false;
    actionEl.textContent = action.label;
    actionEl.onclick = () => {
      window.clearTimeout(Number(toast.dataset.timer));
      toast.hidden = true;
      toast.classList.remove("is-visible");
      clearAction();
      action.onClick();
    };
  } else {
    clearAction();
  }

  window.clearTimeout(Number(toast.dataset.timer));
  const timer = window.setTimeout(() => {
    toast.hidden = true;
    toast.classList.remove("is-visible");
    clearAction();
  }, TOAST_DURATION_MS);
  toast.dataset.timer = String(timer);
}

function updateEmptyState(hasImage: boolean): void {
  const emptyState = document.querySelector<HTMLElement>("#empty-state");
  if (!emptyState) return;
  emptyState.hidden = hasImage;
}

function restorePreset(preset: SavedPreset): void {
  const presets = loadPresetList().filter((entry) => entry.id !== preset.id);
  savePresetList([preset, ...presets]);
}

export async function initControls({
  panel,
  renderer,
  onChange,
}: ControlsOptions): Promise<ControlState> {
  const initial = getInitialSession();
  const state: ControlState = structuredClone(initial.state);
  let imageDataUrl: string | null = initial.imageDataUrl;
  let imageFileName: string | null = imageDataUrl ? "Restored image" : null;

  const rangeInputs = new Map<keyof ControlState, HTMLInputElement>();
  const rangeLabels = new Map<keyof ControlState, HTMLElement>();

  panel.innerHTML = `
    <h1>metaball.space</h1>
    <p class="subtitle">Upload an image to drive dot sizes. Darker areas produce larger metaballs.</p>

    <section>
      <h2>Source image</h2>
      <div class="control">
        <div class="file-picker">
          <input id="image-upload" type="file" accept="image/*" />
          <button type="button" id="image-upload-trigger" class="file-picker-trigger primary">
            Choose image
          </button>
          <p id="image-meta" class="file-meta">No image selected.</p>
        </div>
      </div>
      <div class="control checkbox">
        <label for="invert-mapping">
          <input id="invert-mapping" type="checkbox" />
          Invert mapping (light = large)
        </label>
      </div>
    </section>

    <section>
      <h2>Grid</h2>
      <div id="grid-range-controls"></div>
    </section>

    <details class="advanced">
      <summary>Advanced</summary>
      <p class="advanced-intro">Fine-tune falloff, edge AA, and contour coloring.</p>
      <div id="advanced-range-controls"></div>
    </details>

    <section>
      <h2>Color ramp</h2>
      <div id="ramp-preview" class="ramp-preview" role="img" aria-label="Color ramp preview"></div>
      <div id="ramp-stops"></div>
      <div class="ramp-actions">
        <button type="button" id="add-ramp-stop">Add stop</button>
        <button type="button" id="remove-ramp-stop">Remove stop</button>
      </div>
      <div class="control">
        <label for="bg-color">Background</label>
        <input id="bg-color" type="color" value="${rgbToHex(state.bgColor)}" />
      </div>
    </section>

    <section>
      <h2>Export PNG</h2>
      <div class="export-grid" id="export-buttons"></div>
    </section>

    <section>
      <h2>Presets</h2>
      <div class="control">
        <label for="preset-name">Preset name</label>
        <input id="preset-name" class="text-input" type="text" placeholder="My brand look" autocomplete="off" />
      </div>
      <div class="preset-actions">
        <button type="button" id="save-preset">Save preset</button>
        <button type="button" id="reset-defaults">Reset defaults</button>
      </div>
      <div id="preset-list" class="preset-list"></div>
      <p id="preset-status" class="preset-status" role="status" aria-live="polite"></p>
    </section>
  `;

  const rampPreview = panel.querySelector<HTMLElement>("#ramp-preview")!;
  const rampStopsContainer = panel.querySelector<HTMLElement>("#ramp-stops")!;
  const addStopButton = panel.querySelector<HTMLButtonElement>("#add-ramp-stop")!;
  const removeStopButton =
    panel.querySelector<HTMLButtonElement>("#remove-ramp-stop")!;
  const presetList = panel.querySelector<HTMLElement>("#preset-list")!;
  const presetStatus = panel.querySelector<HTMLElement>("#preset-status")!;
  const presetNameInput = panel.querySelector<HTMLInputElement>("#preset-name")!;
  const invertInput = panel.querySelector<HTMLInputElement>("#invert-mapping")!;
  const bgColorInput = panel.querySelector<HTMLInputElement>("#bg-color")!;
  const imageInput = panel.querySelector<HTMLInputElement>("#image-upload")!;
  const imageUploadTrigger = panel.querySelector<HTMLButtonElement>(
    "#image-upload-trigger",
  )!;
  const imageMeta = panel.querySelector<HTMLElement>("#image-meta")!;
  const emptyUploadTrigger = document.querySelector<HTMLButtonElement>(
    "#empty-upload-trigger",
  );

  const persistSession = debounce(() => {
    saveSession(state, imageDataUrl);
  }, 300);

  const notifyChange = debounce(() => {
    renderer.setState(state);
    updateEmptyState(state.hasImage);
    onChange(state);
    persistSession();
  }, 16);

  function setStatus(message: string): void {
    presetStatus.textContent = message;
  }

  function syncImageMeta(): void {
    if (state.hasImage && imageFileName) {
      imageMeta.textContent = `Loaded: ${imageFileName}`;
      imageUploadTrigger.textContent = "Replace image";
      imageUploadTrigger.classList.remove("primary");
    } else {
      imageMeta.textContent = "No image selected.";
      imageUploadTrigger.textContent = "Choose image";
      imageUploadTrigger.classList.add("primary");
    }
  }

  function syncRangeControls(): void {
    for (const [key, input] of rangeInputs) {
      const value = state[key] as number;
      input.value = String(value);

      const label = rangeLabels.get(key);
      if (!label) continue;

      const config = ALL_RANGE_CONTROLS.find((entry) => entry.key === key);
      const formatted = config?.format ? config.format(value) : String(value);
      label.textContent = formatted;
      input.setAttribute("aria-valuetext", formatted);
    }
  }

  function updateRampPreview(): void {
    rampPreview.style.background = rampGradient(state.rampColors);
    addStopButton.disabled = state.rampColors.length >= MAX_RAMP_STOPS;
    removeStopButton.disabled = state.rampColors.length <= MIN_RAMP_STOPS;
  }

  function renderRampStops(): void {
    rampStopsContainer.innerHTML = "";

    state.rampColors.forEach((color, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "control";
      const inputId = `ramp-stop-${index}`;
      wrapper.innerHTML = `
        <label for="${inputId}">
          Stop ${index + 1} (${stopLabel(index, state.rampColors.length)})
        </label>
        <input
          id="${inputId}"
          type="color"
          value="${rgbToHex(color)}"
        />
      `;

      const input = wrapper.querySelector<HTMLInputElement>(`#${inputId}`)!;
      input.addEventListener("input", () => {
        state.rampColors[index] = hexToRgb(input.value);
        updateRampPreview();
        notifyChange();
      });

      rampStopsContainer.appendChild(wrapper);
    });

    updateRampPreview();
  }

  function syncStaticControls(): void {
    invertInput.checked = state.invert;
    bgColorInput.value = rgbToHex(state.bgColor);
    syncRangeControls();
    renderRampStops();
    syncImageMeta();
    updateEmptyState(state.hasImage);
  }

  async function applySession(session: StoredSession): Promise<void> {
    Object.assign(state, structuredClone(session.state));
    imageDataUrl = session.imageDataUrl;
    imageFileName = imageDataUrl ? "Restored image" : null;

    if (imageDataUrl) {
      const bitmap = await dataUrlToImageBitmap(imageDataUrl);
      renderer.uploadImage(bitmap);
      state.hasImage = true;
    } else {
      state.hasImage = false;
    }

    syncStaticControls();
    renderer.setState(state);
    onChange(state);
    saveSession(state, imageDataUrl);
  }

  function renderPresetList(): void {
    const presets = loadPresetList();
    presetList.innerHTML = "";

    if (presets.length === 0) {
      presetList.innerHTML = `<p class="preset-empty">No saved presets yet.</p>`;
      return;
    }

    for (const preset of presets) {
      const item = document.createElement("div");
      item.className = "preset-item";

      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.className = "preset-load";
      loadButton.textContent = preset.name;

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "preset-delete";
      deleteButton.textContent = "Delete";
      deleteButton.setAttribute("aria-label", `Delete ${preset.name}`);

      loadButton.addEventListener("click", async () => {
        await applySession({
          version: 1,
          state: preset.state,
          imageDataUrl: preset.imageDataUrl,
        });
        presetNameInput.value = preset.name;
        imageFileName = preset.imageDataUrl
          ? `${preset.name} image`
          : null;
        syncImageMeta();
        renderPresetList();
        setStatus(`Loaded "${preset.name}".`);
        showToast(`Loaded “${preset.name}”.`);
      });

      deleteButton.addEventListener("click", () => {
        const confirmed = window.confirm(
          `Delete preset “${preset.name}”? You can undo from the toast.`,
        );
        if (!confirmed) return;

        const snapshot: SavedPreset = structuredClone(preset);
        deletePreset(preset.id);
        renderPresetList();
        setStatus(`Deleted "${preset.name}".`);
        showToast(`Deleted “${preset.name}”.`, {
          label: "Undo",
          onClick: () => {
            restorePreset(snapshot);
            renderPresetList();
            setStatus(`Restored "${preset.name}".`);
            showToast(`Restored “${preset.name}”.`);
          },
        });
      });

      item.append(loadButton, deleteButton);
      presetList.appendChild(item);
    }
  }

  function mountRangeControls(
    containerId: string,
    configs: RangeConfig[],
  ): void {
    const container = panel.querySelector(containerId)!;

    for (const config of configs) {
      const value = state[config.key] as number;
      const inputId = `range-${String(config.key)}`;
      const helpId = config.help ? `${inputId}-help` : undefined;
      const wrapper = document.createElement("div");
      wrapper.className = "control";
      wrapper.innerHTML = `
        <label for="${inputId}">
          ${config.label}
          <span class="value" id="${inputId}-value">${
            config.format ? config.format(value) : value
          }</span>
        </label>
        <input
          id="${inputId}"
          type="range"
          min="${config.min}"
          max="${config.max}"
          step="${config.step}"
          value="${value}"
          aria-valuetext="${config.format ? config.format(value) : value}"
          ${helpId ? `aria-describedby="${helpId}"` : ""}
        />
        ${
          config.help
            ? `<p id="${helpId}" class="control-help">${config.help}</p>`
            : ""
        }
      `;

      const input = wrapper.querySelector("input")!;
      const valueLabel = wrapper.querySelector(".value") as HTMLElement;

      rangeInputs.set(config.key, input);
      rangeLabels.set(config.key, valueLabel);

      input.addEventListener("input", () => {
        const next = parseFloat(input.value);
        Object.assign(state, { [config.key]: next });
        const formatted = config.format ? config.format(next) : String(next);
        valueLabel.textContent = formatted;
        input.setAttribute("aria-valuetext", formatted);
        notifyChange();
      });

      container.appendChild(wrapper);
    }
  }

  async function handleImageFile(file: File): Promise<void> {
    imageDataUrl = await fileToDataUrl(file);
    const bitmap = await createImageBitmap(file);
    renderer.uploadImage(bitmap);
    state.hasImage = true;
    imageFileName = file.name;
    syncImageMeta();
    notifyChange();
    setStatus(`Loaded image “${file.name}”.`);
    showToast(`Loaded “${file.name}”.`);
  }

  mountRangeControls("#grid-range-controls", GRID_PRIMARY_CONTROLS);
  mountRangeControls("#advanced-range-controls", ADVANCED_CONTROLS);
  renderRampStops();

  imageUploadTrigger.addEventListener("click", () => {
    imageInput.click();
  });

  emptyUploadTrigger?.addEventListener("click", () => {
    imageInput.click();
  });

  addStopButton.addEventListener("click", () => {
    if (state.rampColors.length >= MAX_RAMP_STOPS) return;
    const last = state.rampColors[state.rampColors.length - 1];
    state.rampColors.push([...last]);
    renderRampStops();
    notifyChange();
  });

  removeStopButton.addEventListener("click", () => {
    if (state.rampColors.length <= MIN_RAMP_STOPS) return;
    state.rampColors.pop();
    renderRampStops();
    notifyChange();
  });

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    await handleImageFile(file);
  });

  invertInput.addEventListener("change", () => {
    state.invert = invertInput.checked;
    notifyChange();
  });

  bgColorInput.addEventListener("input", () => {
    state.bgColor = hexToRgb(bgColorInput.value);
    notifyChange();
  });

  panel.querySelector<HTMLButtonElement>("#save-preset")!.addEventListener(
    "click",
    () => {
      const saved = upsertPreset(presetNameInput.value, state, imageDataUrl);
      renderPresetList();
      presetNameInput.value = saved.name;
      setStatus(`Saved "${saved.name}".`);
      showToast(`Saved “${saved.name}”.`);
    },
  );

  panel.querySelector<HTMLButtonElement>("#reset-defaults")!.addEventListener(
    "click",
    async () => {
      const confirmed = window.confirm(
        "Reset all controls to defaults and clear the uploaded image?",
      );
      if (!confirmed) return;

      await applySession({
        version: 1,
        state: structuredClone(DEFAULT_STATE),
        imageDataUrl: null,
      });
      presetNameInput.value = "";
      imageInput.value = "";
      imageFileName = null;
      syncImageMeta();
      renderPresetList();
      setStatus("Reset to defaults.");
      showToast("Reset to defaults.");
    },
  );

  const exportContainer = panel.querySelector("#export-buttons")!;
  for (const preset of EXPORT_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.label;
    button.setAttribute("aria-label", `Export PNG ${preset.label}`);
    button.addEventListener("click", async () => {
      if (!state.hasImage) {
        showToast("Upload an image before exporting.");
        setStatus("Upload an image before exporting.");
        return;
      }

      button.disabled = true;
      button.textContent = "Exporting…";
      try {
        renderer.setState(state);
        await exportPreset(renderer, preset);
        showToast(`Downloaded ${preset.label}.`);
        setStatus(`Downloaded ${preset.label}.`);
      } catch {
        showToast("Export failed. Try again.");
        setStatus("Export failed.");
      } finally {
        button.disabled = false;
        button.textContent = preset.label;
      }
    });
    exportContainer.appendChild(button);
  }

  renderPresetList();
  syncStaticControls();

  if (imageDataUrl) {
    const bitmap = await dataUrlToImageBitmap(imageDataUrl);
    renderer.uploadImage(bitmap);
    state.hasImage = true;
    syncImageMeta();
  }

  renderer.setState(state);
  updateEmptyState(state.hasImage);
  onChange(state);

  if (initial.imageDataUrl || loadPresetList().length > 0 || loadSession()) {
    setStatus("Restored your last session.");
  }

  return state;
}
