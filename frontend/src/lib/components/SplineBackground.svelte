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

    (async () => {
      try {
        const { Application } = await import('@splinetool/runtime');
        if (disposed) return;

        app = new Application(canvas);
        await app.load('https://prod.spline.design/G7wVqfFNEKUoQfNS/scene.splinecode');
      } catch (err) {
        console.warn('[SplineBackground] Failed to load:', err);
      }
    })();

    return () => {
      disposed = true;
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
    pointer-events: auto;
  }
</style>
