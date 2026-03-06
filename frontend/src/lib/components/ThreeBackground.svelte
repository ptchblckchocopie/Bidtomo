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
		} catch {
			return false;
		}
	}

	function prefersReducedMotion(): boolean {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	async function initScene() {
		if (!browser || !canvasContainer || prefersReducedMotion() || !hasWebGL()) return;

		if (cleanup) { cleanup(); cleanup = null; }

		if (currentCanvas) {
			currentCanvas.remove();
			currentCanvas = null;
		}
		const canvas = document.createElement('canvas');
		canvas.className = 'three-bg';
		canvas.setAttribute('aria-hidden', 'true');
		canvasContainer.appendChild(canvas);
		currentCanvas = canvas;

		const THREE = await import('three');

		const vertexShader = `
			attribute vec3 position;
			void main() {
				gl_Position = vec4(position, 1.0);
			}
		`;

		const fragmentShader = `
			precision highp float;
			uniform vec2 resolution;
			uniform float time;
			uniform float xScale;
			uniform float yScale;
			uniform float distortion;

			void main() {
				vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);

				float d = length(p) * distortion;

				float rx = p.x * (1.0 + d);
				float gx = p.x;
				float bx = p.x * (1.0 - d);

				float r = 0.05 / abs(p.y + sin((rx + time) * xScale) * yScale);
				float g = 0.05 / abs(p.y + sin((gx + time) * xScale) * yScale);
				float b = 0.05 / abs(p.y + sin((bx + time) * xScale) * yScale);

				gl_FragColor = vec4(r, g, b, 1.0);
			}
		`;

		const renderer = new THREE.WebGLRenderer({ canvas });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(new THREE.Color(0x000000));

		const scene = new THREE.Scene();
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);

		const uniforms = {
			resolution: { value: [window.innerWidth, window.innerHeight] },
			time: { value: 0.0 },
			xScale: { value: 1.0 },
			yScale: { value: 0.5 },
			distortion: { value: 0.05 },
		};

		const positions = new THREE.BufferAttribute(new Float32Array([
			-1.0, -1.0, 0.0,
			 1.0, -1.0, 0.0,
			-1.0,  1.0, 0.0,
			 1.0, -1.0, 0.0,
			-1.0,  1.0, 0.0,
			 1.0,  1.0, 0.0,
		]), 3);

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', positions);

		const material = new THREE.RawShaderMaterial({
			vertexShader,
			fragmentShader,
			uniforms,
			side: THREE.DoubleSide,
		});

		const mesh = new THREE.Mesh(geometry, material);
		scene.add(mesh);

		function handleResize() {
			const w = window.innerWidth;
			const h = window.innerHeight;
			renderer.setSize(w, h, false);
			uniforms.resolution.value = [w, h];
		}

		handleResize();

		function animate() {
			animationId = requestAnimationFrame(animate);
			uniforms.time.value += 0.01;
			renderer.render(scene, camera);
		}

		animationId = requestAnimationFrame(animate);

		window.addEventListener('resize', handleResize);

		cleanup = () => {
			cancelAnimationFrame(animationId);
			window.removeEventListener('resize', handleResize);
			scene.remove(mesh);
			geometry.dispose();
			material.dispose();
			renderer.dispose();
			if (currentCanvas) {
				currentCanvas.remove();
				currentCanvas = null;
			}
		};
	}

	function destroyScene() {
		if (cleanup) { cleanup(); cleanup = null; }
	}

	onMount(() => {
		if (!browser) return;
		initScene();
	});

	onDestroy(() => {
		destroyScene();
	});
</script>

<div bind:this={canvasContainer} class="three-bg-container" aria-hidden="true"></div>

<style>
	.three-bg-container {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: 0;
		pointer-events: none;
	}

	.three-bg-container :global(.three-bg) {
		width: 100%;
		height: 100%;
	}
</style>
