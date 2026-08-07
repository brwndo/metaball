import { initControls } from "./ui/controls";
import { Renderer } from "./webgl/Renderer";

const PREVIEW_SIZE = 900;
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getPreviewDimensions(): { width: number; height: number } {
  const preview = document.querySelector<HTMLElement>(".preview");
  if (!preview) {
    return { width: PREVIEW_SIZE, height: PREVIEW_SIZE };
  }

  const maxWidth = preview.clientWidth - 48;
  const maxHeight = preview.clientHeight - 48;
  const size = Math.min(PREVIEW_SIZE, maxWidth, maxHeight);

  return {
    width: Math.max(1, Math.floor(size)),
    height: Math.max(1, Math.floor(size)),
  };
}

function initPanelToggle(): void {
  const panel = document.querySelector<HTMLElement>("#controls-panel");
  const toggle = document.querySelector<HTMLButtonElement>("#panel-toggle");
  if (!panel || !toggle) return;

  const media = window.matchMedia("(max-width: 768px)");
  let previouslyFocused: HTMLElement | null = null;
  let trapHandler: ((event: KeyboardEvent) => void) | null = null;

  const getFocusable = (): HTMLElement[] => {
    const inPanel = [
      ...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ].filter(
      (el) =>
        !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
    );

    // Keep the floating Close control in the dialog tab cycle on mobile.
    if (media.matches && panel.classList.contains("is-open")) {
      return [toggle, ...inPanel];
    }

    return inPanel;
  };

  const releaseTrap = () => {
    if (trapHandler) {
      document.removeEventListener("keydown", trapHandler);
      trapHandler = null;
    }
    panel.removeAttribute("role");
    panel.removeAttribute("aria-modal");
  };

  const setOpen = (open: boolean) => {
    panel.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Close" : "Controls";

    if (open && media.matches) {
      previouslyFocused =
        (document.activeElement as HTMLElement | null) ?? toggle;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");

      trapHandler = (event: KeyboardEvent) => {
        if (event.key !== "Tab" || !panel.classList.contains("is-open")) return;

        const focusable = getFocusable();
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };

      document.addEventListener("keydown", trapHandler);
      requestAnimationFrame(() => {
        toggle.focus();
      });
      return;
    }

    releaseTrap();
    if (!open && previouslyFocused) {
      previouslyFocused.focus();
      previouslyFocused = null;
    }
  };

  toggle.addEventListener("click", () => {
    setOpen(!panel.classList.contains("is-open"));
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) {
      setOpen(false);
    }
  });

  media.addEventListener("change", () => {
    if (!media.matches && panel.classList.contains("is-open")) {
      setOpen(false);
    }
  });

  // Close overlay after choosing an image on small screens so the preview is visible.
  panel.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (
      media.matches &&
      target?.id === "image-upload" &&
      target.files?.length
    ) {
      setOpen(false);
    }
  });
}

function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#preview-canvas");
  const panel = document.querySelector<HTMLElement>("#controls-panel");
  const controlsContent = document.querySelector<HTMLElement>("#controls-content");

  if (!canvas || !panel || !controlsContent) {
    throw new Error("Missing required DOM elements");
  }

  const renderer = new Renderer(canvas);
  let needsRender = true;

  const requestRender = () => {
    needsRender = true;
  };

  const resize = () => {
    const { width, height } = getPreviewDimensions();
    renderer.resizePreview(width, height);
    requestRender();
  };

  resize();
  window.addEventListener("resize", resize);
  initPanelToggle();

  initControls({
    panel: controlsContent,
    renderer,
    onChange: () => requestRender(),
  }).then(() => {
    resize();
  });

  const loop = () => {
    if (needsRender) {
      renderer.render();
      needsRender = false;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main();
