<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let {
		active = false,
		onMidpoint = () => {},
		onComplete = () => {}
	}: {
		active: boolean;
		onMidpoint: () => void;
		onComplete: () => void;
	} = $props();

	let threeModule: typeof import('three') | null = null;

	onMount(() => {
		if (browser) {
			import('three')
				.then((m) => {
					threeModule = m;
				})
				.catch(() => {});
		}
	});

	function hasWebGL(): boolean {
		try {
			const c = document.createElement('canvas');
			return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
		} catch {
			return false;
		}
	}

	function prefersReducedMotion(): boolean {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function easeOutCubic(t: number): number {
		return 1 - Math.pow(1 - t, 3);
	}

	function easeInCubic(t: number): number {
		return t * t * t;
	}

	$effect(() => {
		if (!active || !browser) return;

		if (prefersReducedMotion()) {
			onMidpoint();
			onComplete();
			return;
		}

		if (!threeModule || !hasWebGL()) {
			runCssFallback();
		} else {
			runThreeAnimation();
		}
	});

	function runCssFallback() {
		const overlay = document.createElement('div');
		overlay.style.cssText = `
			position: fixed; inset: 0; z-index: 99999;
			background: var(--color-fg);
			clip-path: circle(0% at 50% 50%);
			transition: clip-path 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		`;
		document.body.appendChild(overlay);

		requestAnimationFrame(() => {
			overlay.style.clipPath = 'circle(150% at 50% 50%)';
		});

		setTimeout(onMidpoint, 200);

		setTimeout(() => {
			overlay.style.clipPath = 'circle(0% at 50% 50%)';
			setTimeout(() => {
				overlay.remove();
				onComplete();
			}, 400);
		}, 500);
	}

	function runThreeAnimation() {
		const THREE = threeModule!;
		const w = window.innerWidth;
		const h = window.innerHeight;

		const canvas = document.createElement('canvas');
		canvas.style.cssText =
			'position:fixed;inset:0;z-index:99999;pointer-events:none;width:100vw;height:100vh;';
		document.body.appendChild(canvas);

		const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
		renderer.setSize(w, h);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		const scene = new THREE.Scene();
		const camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 10);
		camera.position.z = 5;

		const bauhausColors = [0xd02020, 0x1040c0, 0xf0c020];

		const cols = Math.ceil(w / 100) + 2;
		const rows = Math.ceil(h / 100) + 2;
		const cellW = w / cols;
		const cellH = h / rows;
		const centerX = cols / 2;
		const centerY = rows / 2;
		const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

		interface ShapeData {
			mesh: InstanceType<typeof THREE.Mesh>;
			delay: number;
			targetScale: number;
		}

		const shapes: ShapeData[] = [];

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const type = Math.floor(Math.random() * 3);
				const color = bauhausColors[Math.floor(Math.random() * 3)];
				const size = Math.max(cellW, cellH) * 0.85;

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let geometry: any;
				if (type === 0) {
					geometry = new THREE.CircleGeometry(size / 2, 32);
				} else if (type === 1) {
					geometry = new THREE.PlaneGeometry(size, size);
				} else {
					geometry = new THREE.BufferGeometry();
					const vertices = new Float32Array([
						0,
						size / 2,
						0,
						-size / 2,
						-size / 2,
						0,
						size / 2,
						-size / 2,
						0
					]);
					geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
				}

				const material = new THREE.MeshBasicMaterial({ color });
				const mesh = new THREE.Mesh(geometry, material);

				mesh.position.x = (c - centerX + 0.5) * cellW;
				mesh.position.y = (r - centerY + 0.5) * cellH;
				mesh.rotation.z = Math.random() * Math.PI * 2;
				mesh.scale.set(0, 0, 1);

				scene.add(mesh);

				const dx = c - centerX;
				const dy = r - centerY;
				const dist = Math.sqrt(dx * dx + dy * dy);
				shapes.push({ mesh, delay: (dist / maxDist) * 200, targetScale: 1.2 });
			}
		}

		const startTime = performance.now();
		let midpointFired = false;

		function animate() {
			const elapsed = performance.now() - startTime;

			if (elapsed >= 450 && !midpointFired) {
				midpointFired = true;
				onMidpoint();
			}

			for (const shape of shapes) {
				let scale: number;

				if (elapsed < 400) {
					const duration = Math.max(1, 400 - shape.delay);
					const t = Math.max(0, (elapsed - shape.delay) / duration);
					scale = easeOutCubic(Math.min(1, t)) * shape.targetScale;
				} else if (elapsed < 500) {
					scale = shape.targetScale;
				} else {
					const maxDelay = 200;
					const reverseDelay = maxDelay - shape.delay;
					const phaseElapsed = elapsed - 500;
					const duration = Math.max(1, 400 - reverseDelay);
					const t = Math.max(0, (phaseElapsed - reverseDelay) / duration);
					scale = shape.targetScale * (1 - easeInCubic(Math.min(1, t)));
				}

				shape.mesh.scale.set(scale, scale, 1);
			}

			renderer.render(scene, camera);

			if (elapsed < 900) {
				requestAnimationFrame(animate);
			} else {
				for (const s of shapes) {
					s.mesh.geometry.dispose();
					(s.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).dispose();
				}
				renderer.dispose();
				renderer.forceContextLoss();
				canvas.remove();
				onComplete();
			}
		}

		requestAnimationFrame(animate);
	}
</script>
