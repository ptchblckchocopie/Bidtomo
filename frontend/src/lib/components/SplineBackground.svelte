<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

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
        await app.load('https://prod.spline.design/LOMNBnqlNO2YDRGn/scene.splinecode');
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
  aria-hidden="true"
></canvas>

<style>
  .spline-bg {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    pointer-events: none;
  }
</style>
