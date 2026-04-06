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
		canvas.className = 'silk-bg';
		canvas.setAttribute('aria-hidden', 'true');
		canvasContainer.appendChild(canvas);
		currentCanvas = canvas;

		const THREE = await import('three');

		const vertexShader = `
			attribute vec3 position;
			attribute vec2 uv;
			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = vec4(position, 1.0);
			}
		`;

		const fragmentShader = `
			precision highp float;
			varying vec2 vUv;

			uniform float uTime;
			uniform vec3  uColor;
			uniform float uSpeed;
			uniform float uScale;
			uniform float uRotation;
			uniform float uNoiseIntensity;

			const float e = 2.71828182845904523536;

			float noise(vec2 texCoord) {
				float G = e;
				vec2  r = (G * sin(G * texCoord));
				return fract(r.x * r.y * (1.0 + texCoord.x));
			}

			vec2 rotateUvs(vec2 uv, float angle) {
				float c = cos(angle);
				float s = sin(angle);
				mat2  rot = mat2(c, -s, s, c);
				return rot * uv;
			}

			void main() {
				float rnd        = noise(gl_FragCoord.xy);
				vec2  uv         = rotateUvs(vUv * uScale, uRotation);
				vec2  tex        = uv * uScale;
				float tOffset    = uSpeed * uTime;

				tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

				float pattern = 0.6 +
					0.4 * sin(5.0 * (tex.x + tex.y +
						cos(3.0 * tex.x + 5.0 * tex.y) +
						0.02 * tOffset) +
						sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

				vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
				col.a = 1.0;
				gl_FragColor = col;
			}
		`;

		const renderer = new THREE.WebGLRenderer({ canvas, alpha: false });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(new THREE.Color(0x060010));

		const scene = new THREE.Scene();
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);

		// Silk params: color #7B7481, speed 5, scale 1, noiseIntensity 1.5, rotation 0
		const color = [0x7B / 255, 0x74 / 255, 0x81 / 255];

		const uniforms = {
			uTime:           { value: 0.0 },
			uSpeed:          { value: 5.0 },
			uScale:          { value: 1.0 },
			uNoiseIntensity: { value: 1.5 },
			uColor:          { value: new THREE.Color(color[0], color[1], color[2]) },
			uRotation:       { value: 0.0 },
		};

		// Full-screen quad with UVs
		const positions = new Float32Array([
			-1, -1, 0,
			 1, -1, 0,
			-1,  1, 0,
			 1, -1, 0,
			-1,  1, 0,
			 1,  1, 0,
		]);
		const uvs = new Float32Array([
			0, 0,
			1, 0,
			0, 1,
			1, 0,
			0, 1,
			1, 1,
		]);

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

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
		}

		handleResize();

		function animate() {
			animationId = requestAnimationFrame(animate);
			uniforms.uTime.value += 0.005;
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

	onMount(() => {
		if (!browser) return;
		initScene();
	});

	onDestroy(() => {
		if (cleanup) { cleanup(); cleanup = null; }
	});
</script>

<div bind:this={canvasContainer} class="silk-bg-container" aria-hidden="true"></div>

<style>
	.silk-bg-container {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: 0;
		pointer-events: none;
	}

	.silk-bg-container :global(.silk-bg) {
		width: 100%;
		height: 100%;
	}
</style>
