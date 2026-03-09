# Three.js & WebGL Patterns

All patterns extracted from the Bidtomo codebase (ThreeBackground.svelte, ThemeTransition.svelte).

## Fullscreen Shader Boilerplate

The canonical pattern for a full-screen WebGL effect:

```svelte
<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';

  let canvasContainer: HTMLDivElement;
  let currentCanvas: HTMLCanvasElement | null = null;
  let animationId: number;
  let cleanup: (() => void) | null = null;

  function hasWebGL(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  }

  function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  async function initScene() {
    if (!browser || !canvasContainer || prefersReducedMotion() || !hasWebGL()) return;
    if (cleanup) { cleanup(); cleanup = null; }
    if (currentCanvas) { currentCanvas.remove(); currentCanvas = null; }

    const canvas = document.createElement('canvas');
    canvas.className = 'three-bg';
    canvas.setAttribute('aria-hidden', 'true');
    canvasContainer.appendChild(canvas);
    currentCanvas = canvas;

    const THREE = await import('three');

    // --- Shaders ---
    const vertexShader = `
      attribute vec3 position;
      void main() { gl_Position = vec4(position, 1.0); }
    `;
    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      void main() {
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
        // Your effect here
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      }
    `;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(new THREE.Color(0x000000));

    // --- Scene ---
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);

    // --- Uniforms ---
    const uniforms = {
      resolution: { value: [window.innerWidth, window.innerHeight] },
      time: { value: 0.0 },
    };

    // --- Fullscreen quad (2 triangles, 6 vertices) ---
    const positions = new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0,  1, -1, 0,  -1, 1, 0,
       1, -1, 0, -1,  1, 0,   1, 1, 0,
    ]), 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positions);

    const material = new THREE.RawShaderMaterial({
      vertexShader, fragmentShader, uniforms, side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // --- Resize ---
    function handleResize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      uniforms.resolution.value = [w, h];
    }
    handleResize();

    // --- Animate ---
    function animate() {
      animationId = requestAnimationFrame(animate);
      uniforms.time.value += 0.01;
      renderer.render(scene, camera);
    }
    animationId = requestAnimationFrame(animate);
    window.addEventListener('resize', handleResize);

    // --- Cleanup ---
    cleanup = () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (currentCanvas) { currentCanvas.remove(); currentCanvas = null; }
    };
  }

  onMount(() => { if (browser) initScene(); });
  onDestroy(() => { if (cleanup) { cleanup(); cleanup = null; } });
</script>

<div bind:this={canvasContainer} class="three-bg-container" aria-hidden="true"></div>

<style>
  .three-bg-container {
    position: fixed; inset: 0; width: 100vw; height: 100vh;
    z-index: 0; pointer-events: none;
  }
  .three-bg-container :global(.three-bg) { width: 100%; height: 100%; }
</style>
```

---

## Shader Writing Guide

### Coordinate normalization
```glsl
vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
// p is now centered at (0,0), aspect-ratio corrected
```

### Chromatic aberration (from ThreeBackground)
```glsl
float d = length(p) * distortion;
float rx = p.x * (1.0 + d);
float gx = p.x;
float bx = p.x * (1.0 - d);
float r = 0.05 / abs(p.y + sin((rx + time) * xScale) * yScale);
float g = 0.05 / abs(p.y + sin((gx + time) * xScale) * yScale);
float b = 0.05 / abs(p.y + sin((bx + time) * xScale) * yScale);
gl_FragColor = vec4(r, g, b, 1.0);
```

### Common uniforms
```glsl
uniform vec2 resolution;  // viewport size
uniform float time;        // elapsed time
uniform vec2 mouse;        // cursor position (normalized)
uniform float intensity;   // effect strength
```

---

## GSAP Integration

### Import pattern (handles different module formats)
```js
const gsapModule = await import('gsap');
const gsapRef = (gsapModule as any).default || (gsapModule as any).gsap || gsapModule;
```

### Animating Three.js materials with GSAP
```js
gsapRef.to(mesh.material, {
  opacity: 1,
  duration: 0.5,
  ease: 'power2.inOut',
});
```

### Animating mesh transforms with GSAP
```js
gsapRef.to(mesh.scale, {
  x: 1.2, y: 1.2,
  duration: 0.8,
  ease: 'power3.out',
});
```

---

## Performance Guidelines

1. **Pixel ratio**: Always `Math.min(window.devicePixelRatio, 2)`
2. **Dispose everything**: geometry, material, renderer, textures on component destroy
3. **forceContextLoss**: Call `renderer.forceContextLoss()` before removing canvas (prevents WebGL context leaks)
4. **pointer-events: none**: On overlay canvases to allow click-through
5. **aria-hidden="true"**: On all decorative canvases
6. **will-change: transform**: On DOM elements that animate frequently
7. **prefers-reduced-motion**: Always check and skip animations if set
8. **requestAnimationFrame**: Always cancel on destroy, store the ID
9. **Resize listener**: Always remove on cleanup, use `{ passive: true }` where possible

---

## Common Effect Recipes

### Particles (point-based)
```js
const particleCount = 1000;
const positions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount * 3; i++) positions[i] = (Math.random() - 0.5) * 10;
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const material = new THREE.PointsMaterial({ size: 0.02, color: 0xffffff, transparent: true, opacity: 0.6 });
const points = new THREE.Points(geometry, material);
```

### Noise/grain overlay (fragment shader)
```glsl
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
float grain = rand(gl_FragCoord.xy + time) * 0.03;
gl_FragColor.rgb += grain;
```

### Gradient mesh background
```glsl
vec3 col = mix(vec3(0.04, 0.04, 0.05), vec3(0.06, 0.04, 0.08),
  smoothstep(-0.5, 0.5, p.y + sin(p.x * 2.0 + time) * 0.1));
```
