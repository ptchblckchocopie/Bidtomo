<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  let {
    sparkColor = '#fff',
    sparkSize = 10,
    sparkRadius = 15,
    sparkCount = 8,
    duration = 400,
    easing = 'ease-out',
    extraScale = 1.0,
    children
  }: {
    sparkColor?: string;
    sparkSize?: number;
    sparkRadius?: number;
    sparkCount?: number;
    duration?: number;
    easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
    extraScale?: number;
    children?: Snippet;
  } = $props();

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let sparks: Array<{ x: number; y: number; angle: number; startTime: number }> = [];
  let animationId: number;

  function ease(t: number): number {
    switch (easing) {
      case 'linear': return t;
      case 'ease-in': return t * t;
      case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default: return t * (2 - t); // ease-out
    }
  }

  function resizeCanvas() {
    if (!canvas || !container) return;
    const { width, height } = container.getBoundingClientRect();
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function draw(timestamp: number) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    sparks = sparks.filter(spark => {
      const elapsed = timestamp - spark.startTime;
      if (elapsed >= duration) return false;

      const progress = elapsed / duration;
      const eased = ease(progress);

      const distance = eased * sparkRadius * extraScale;
      const lineLength = sparkSize * (1 - eased);

      const x1 = spark.x + distance * Math.cos(spark.angle);
      const y1 = spark.y + distance * Math.sin(spark.angle);
      const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
      const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

      ctx.strokeStyle = sparkColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      return true;
    });

    animationId = requestAnimationFrame(draw);
  }

  function handleClick(e: MouseEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const now = performance.now();
    for (let i = 0; i < sparkCount; i++) {
      sparks.push({
        x,
        y,
        angle: (2 * Math.PI * i) / sparkCount,
        startTime: now
      });
    }
  }

  onMount(() => {
    resizeCanvas();

    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(container);

    animationId = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(animationId);
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={container}
  class="click-spark-container"
  onclick={handleClick}
>
  <canvas
    bind:this={canvas}
    class="click-spark-canvas"
  ></canvas>
  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  .click-spark-container {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .click-spark-canvas {
    width: 100%;
    height: 100%;
    display: block;
    user-select: none;
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 9999;
  }
</style>
