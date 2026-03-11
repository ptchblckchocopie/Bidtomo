<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let {
    url = 'https://prod.spline.design/LOMNBnqlNO2YDRGn/scene.splinecode',
    scale = 140,
    offsetY = 50,
    opacity = 0.7,
    zoom = 1,
    fadeBottom = false,
  }: {
    url?: string;
    scale?: number;
    offsetY?: number;
    opacity?: number;
    zoom?: number;
    fadeBottom?: boolean;
  } = $props();

  let canvas: HTMLCanvasElement;

  onMount(() => {
    if (!browser) return;

    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let app: any;
    let disposed = false;

    // Forward pointer events from the window to the canvas so Spline
    // picks up cursor position even though content layers sit above.
    function forwardPointer(e: PointerEvent) {
      if (!canvas || disposed) return;
      canvas.dispatchEvent(new PointerEvent(e.type, {
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        bubbles: false,
      }));
    }

    function forwardMouse(e: MouseEvent) {
      if (!canvas || disposed) return;
      canvas.dispatchEvent(new MouseEvent(e.type, {
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        bubbles: false,
      }));
    }

    window.addEventListener('pointermove', forwardPointer, { passive: true });
    window.addEventListener('mousemove', forwardMouse, { passive: true });

    (async () => {
      try {
        const { Application } = await import('@splinetool/runtime');
        if (disposed) return;

        app = new Application(canvas);
        await app.load(url);
      } catch (err) {
        console.warn('[SplineBackground] Failed to load:', err);
      }
    })();

    return () => {
      disposed = true;
      window.removeEventListener('pointermove', forwardPointer);
      window.removeEventListener('mousemove', forwardMouse);
      if (app) {
        try { app.dispose(); } catch {}
      }
    };
  });
</script>

<canvas
  bind:this={canvas}
  class="spline-bg"
  style="top:{offsetY}%;width:{scale}%;height:{scale}%;opacity:{opacity};{zoom !== 1 ? `transform:translate(-50%,-50%) scale(${zoom});` : ''}{fadeBottom ? '-webkit-mask-image:linear-gradient(to bottom,black 30%,transparent 75%);mask-image:linear-gradient(to bottom,black 30%,transparent 75%);' : ''}"
  aria-hidden="true"
></canvas>
<div class="spline-watermark-fade" aria-hidden="true"></div>

<style>
  .spline-bg {
    position: fixed;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 0;
    pointer-events: none;
  }
  .spline-watermark-fade {
    position: fixed;
    bottom: 0;
    right: 0;
    width: 320px;
    height: 120px;
    background: radial-gradient(ellipse at 100% 100%, var(--color-bg, #0A0A0A) 20%, transparent 70%);
    z-index: 1;
    pointer-events: none;
  }
</style>
