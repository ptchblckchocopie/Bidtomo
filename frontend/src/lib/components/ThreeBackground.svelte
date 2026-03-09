<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';

	let canvasContainer: HTMLDivElement;
	let currentCanvas: HTMLCanvasElement | null = null;
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
		if (currentCanvas) { currentCanvas.remove(); currentCanvas = null; }

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

		// Smooth dark gradient + original chromatic sine wave laser
		const fragmentShader = `
			precision highp float;
			uniform vec2 resolution;
			uniform float time;
			uniform vec2 mouse;
			uniform float xScale;
			uniform float yScale;
			uniform float distortion;

			// Simplex noise for smooth background
			vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

			float snoise(vec2 v) {
				const vec4 C = vec4(0.211324865405187, 0.366025403784439,
					-0.577350269189626, 0.024390243902439);
				vec2 i  = floor(v + dot(v, C.yy));
				vec2 x0 = v - i + dot(i, C.xx);
				vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
				vec4 x12 = x0.xyxy + C.xxzz;
				x12.xy -= i1;
				i = mod(i, 289.0);
				vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
					+ i.x + vec3(0.0, i1.x, 1.0));
				vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
					dot(x12.zw, x12.zw)), 0.0);
				m = m*m;
				m = m*m;
				vec3 x = 2.0 * fract(p * C.www) - 1.0;
				vec3 h = abs(x) - 0.5;
				vec3 ox = floor(x + 0.5);
				vec3 a0 = x - ox;
				m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
				vec3 g;
				g.x = a0.x * x0.x + h.x * x0.y;
				g.yz = a0.yz * x12.xz + h.yz * x12.yw;
				return 130.0 * dot(m, g);
			}

			void main() {
				vec2 uv = gl_FragCoord.xy / resolution;
				vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);

				float t = time * 0.08;

				// === SMOOTH DARK GRADIENT BACKGROUND ===
				float n1 = snoise(p * 0.6 + vec2(t * 0.3, t * 0.2)) * 0.5 + 0.5;
				float n2 = snoise(p * 0.4 - vec2(t * 0.15, t * 0.25) + 5.0) * 0.5 + 0.5;
				float n3 = snoise(p * 0.8 + vec2(t * 0.1, -t * 0.15) + 10.0) * 0.5 + 0.5;

				vec3 base = vec3(0.035, 0.035, 0.045);
				vec3 deep = vec3(0.02, 0.04, 0.08);
				vec3 teal = vec3(0.03, 0.06, 0.07);
				vec3 warm = vec3(0.05, 0.03, 0.06);

				vec3 col = base;
				col = mix(col, deep, n1 * 0.6);
				col = mix(col, teal, n2 * 0.4);
				col = mix(col, warm, n3 * 0.3);

				// === CHROMATIC SINE WAVE LASER (original effect) ===
				float d = length(p) * distortion;

				float rx = p.x * (1.0 + d);
				float gx = p.x;
				float bx = p.x * (1.0 - d);

				float r = 0.035 / abs(p.y + sin((rx + time) * xScale) * yScale);
				float g = 0.035 / abs(p.y + sin((gx + time) * xScale) * yScale);
				float b = 0.035 / abs(p.y + sin((bx + time) * xScale) * yScale);

				// Clamp individual channels to prevent white blowout
				vec3 laser = vec3(r, g, b);
				laser = min(laser, vec3(0.7, 0.7, 0.7));

				// Blend laser onto smooth background
				col += laser;

				// Mouse influence — subtle warm glow near cursor
				vec2 mouseUV = mouse / resolution;
				float mouseDist = length(uv - mouseUV);
				float mouseGlow = exp(-mouseDist * mouseDist * 6.0) * 0.03;
				col += vec3(0.15, 0.12, 0.2) * mouseGlow;

				// Soft vignette
				float vig = 1.0 - length(uv - 0.5) * 0.8;
				vig = smoothstep(0.1, 0.85, vig);
				col *= vig;

				gl_FragColor = vec4(col, 1.0);
			}
		`;

		const renderer = new THREE.WebGLRenderer({ canvas, alpha: false });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(new THREE.Color(0x000000));

		const scene = new THREE.Scene();
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);

		const uniforms = {
			resolution: { value: [window.innerWidth, window.innerHeight] },
			time: { value: 0.0 },
			mouse: { value: [window.innerWidth / 2, window.innerHeight / 2] },
			xScale: { value: 1.0 },
			yScale: { value: 0.5 },
			distortion: { value: 0.20 },
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

		let animationId: number;

		function handleResize() {
			const w = window.innerWidth;
			const h = window.innerHeight;
			renderer.setSize(w, h, false);
			uniforms.resolution.value = [w, h];
		}

		function handleMouseMove(e: MouseEvent) {
			uniforms.mouse.value = [e.clientX, window.innerHeight - e.clientY];
		}

		handleResize();

		function animate() {
			animationId = requestAnimationFrame(animate);
			uniforms.time.value += 0.01;
			renderer.render(scene, camera);
		}

		animationId = requestAnimationFrame(animate);

		window.addEventListener('resize', handleResize);
		window.addEventListener('mousemove', handleMouseMove);

		cleanup = () => {
			cancelAnimationFrame(animationId);
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('mousemove', handleMouseMove);
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

	onMount(() => {
		if (!browser) return;
		initScene();
	});

	onDestroy(() => {
		if (cleanup) { cleanup(); cleanup = null; }
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
