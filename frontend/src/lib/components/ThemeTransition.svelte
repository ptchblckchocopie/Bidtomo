<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { isDark } from '$lib/stores/theme';

	let {
		active = false,
		onMidpoint = () => {},
		onComplete = () => {}
	}: {
		active: boolean;
		onMidpoint: () => void;
		onComplete: () => void;
	} = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let threeModule: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let gsapRef: any = null;

	onMount(() => {
		if (browser) {
			Promise.all([import('three'), import('gsap')])
				.then(([three, gsap]) => {
					threeModule = three;
					gsapRef = (gsap as any).default || (gsap as any).gsap || gsap;
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

	let runningTransition = false;

	$effect(() => {
		if (!active || !browser || runningTransition) return;

		// Snapshot dark state before starting — don't let $isDark change mid-animation re-trigger this effect
		const wasDark = $isDark;
		runningTransition = true;

		if (prefersReducedMotion()) {
			onMidpoint();
			onComplete();
			runningTransition = false;
			return;
		}

		if (!threeModule || !hasWebGL()) {
			runCssFallback();
		} else if (wasDark) {
			runDarkToLightTransition();
		} else {
			runLightToDarkTransition();
		}
	});

	function runCssFallback() {
		const overlay = document.createElement('div');
		overlay.style.cssText = `
			position: fixed; inset: 0; z-index: 99999;
			background: var(--color-fg);
			clip-path: circle(0% at 50% 50%);
			transition: clip-path 0.3s ease-out;
		`;
		document.body.appendChild(overlay);

		requestAnimationFrame(() => {
			overlay.style.clipPath = 'circle(150% at 50% 50%)';
		});

		setTimeout(onMidpoint, 180);

		setTimeout(() => {
			overlay.style.clipPath = 'circle(0% at 50% 50%)';
			setTimeout(() => {
				overlay.remove();
				runningTransition = false;
				onComplete();
			}, 300);
		}, 400);
	}

	function runLightToDarkTransition() {
		const THREE = threeModule;
		const gsap = gsapRef;
		const w = window.innerWidth;
		const h = window.innerHeight;

		const canvas = document.createElement('canvas');
		canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;width:100vw;height:100vh;';
		document.body.appendChild(canvas);

		const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
		renderer.setSize(w, h);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		const scene = new THREE.Scene();
		const camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 10);
		camera.position.z = 5;

		// Swiss grid wipe — diagonal sweep of black rectangles
		const cols = Math.ceil(w / 60) + 1;
		const rows = Math.ceil(h / 60) + 1;
		const cellW = w / cols;
		const cellH = h / rows;
		const centerX = cols / 2;
		const centerY = rows / 2;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const cells: { mesh: any; delay: number }[] = [];

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const geo = new THREE.PlaneGeometry(cellW + 1, cellH + 1);
				const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
				const mesh = new THREE.Mesh(geo, mat);
				mesh.position.x = (c - centerX + 0.5) * cellW;
				mesh.position.y = (r - centerY + 0.5) * cellH;
				mesh.scale.set(0, 0, 1);
				scene.add(mesh);

				const dist = (c + r) / (cols + rows);
				cells.push({ mesh, delay: dist * 0.25 });
			}
		}

		let midpointFired = false;

		for (const cell of cells) {
			gsap.to(cell.mesh.scale, {
				x: 1, y: 1, duration: 0.15, delay: cell.delay, ease: 'power2.out'
			});
		}

		setTimeout(() => {
			if (!midpointFired) { midpointFired = true; onMidpoint(); }
		}, 350);

		setTimeout(() => {
			for (const cell of cells) {
				const reverseDelay = 0.25 - cell.delay;
				gsap.to(cell.mesh.scale, {
					x: 0, y: 0, duration: 0.15, delay: Math.max(0, reverseDelay), ease: 'power2.in'
				});
			}
		}, 400);

		setTimeout(() => {
			for (const cell of cells) {
				cell.mesh.geometry.dispose();
				cell.mesh.material.dispose();
			}
			renderer.dispose();
			renderer.forceContextLoss();
			canvas.remove();
			runningTransition = false;
			onComplete();
		}, 750);

		function render() {
			renderer.render(scene, camera);
			if (canvas.parentNode) requestAnimationFrame(render);
		}
		requestAnimationFrame(render);
	}

	function runDarkToLightTransition() {
		const THREE = threeModule;
		const gsap = gsapRef;
		const w = window.innerWidth;
		const h = window.innerHeight;

		const canvas = document.createElement('canvas');
		canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;width:100vw;height:100vh;';
		document.body.appendChild(canvas);

		const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
		renderer.setSize(w, h);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		const scene = new THREE.Scene();
		const camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 10);
		camera.position.z = 5;

		// Particle burst — indigo particles explode outward
		const particleCount = 200;
		const colors = [0x5E6AD2, 0x785AD2, 0x4A56B8, 0xFFFFFF];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const particles: { mesh: any; vx: number; vy: number }[] = [];

		for (let i = 0; i < particleCount; i++) {
			const size = Math.random() * 8 + 2;
			const geo = Math.random() > 0.5
				? new THREE.CircleGeometry(size, 16)
				: new THREE.PlaneGeometry(size, size);
			const mat = new THREE.MeshBasicMaterial({
				color: colors[Math.floor(Math.random() * colors.length)],
				transparent: true, opacity: 1
			});
			const mesh = new THREE.Mesh(geo, mat);
			mesh.position.set(0, 0, 0);
			mesh.scale.set(0, 0, 1);
			scene.add(mesh);

			const angle = Math.random() * Math.PI * 2;
			const speed = Math.random() * 15 + 5;
			particles.push({ mesh, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
		}

		// White overlay
		const overlay = new THREE.Mesh(
			new THREE.PlaneGeometry(w * 2, h * 2),
			new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0 })
		);
		overlay.position.z = -1;
		scene.add(overlay);

		let midpointFired = false;

		for (const p of particles) {
			gsap.to(p.mesh.scale, { x: 1, y: 1, duration: 0.2, ease: 'power2.out' });
			gsap.to(p.mesh.position, { x: p.vx * 40, y: p.vy * 40, duration: 0.6, ease: 'power2.out' });
		}

		gsap.to(overlay.material, { opacity: 1, duration: 0.3, delay: 0.1, ease: 'power2.in' });

		setTimeout(() => {
			if (!midpointFired) { midpointFired = true; onMidpoint(); }
		}, 300);

		setTimeout(() => {
			gsap.to(overlay.material, { opacity: 0, duration: 0.3, ease: 'power2.out' });
			for (const p of particles) {
				gsap.to(p.mesh.material, { opacity: 0, duration: 0.2, ease: 'power2.in' });
			}
		}, 400);

		setTimeout(() => {
			for (const p of particles) {
				p.mesh.geometry.dispose();
				p.mesh.material.dispose();
			}
			overlay.geometry.dispose();
			overlay.material.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
			canvas.remove();
			runningTransition = false;
			onComplete();
		}, 750);

		function render() {
			renderer.render(scene, camera);
			if (canvas.parentNode) requestAnimationFrame(render);
		}
		requestAnimationFrame(render);
	}
</script>
