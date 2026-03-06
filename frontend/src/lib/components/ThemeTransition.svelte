<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { isDark } from '$lib/stores/theme';
	import { get } from 'svelte/store';

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
	let isRunning = false;

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

	// Only react to `active` changing — capture isDark at trigger time
	$effect(() => {
		if (!active || !browser || isRunning) return;

		// Snapshot the current theme BEFORE the transition starts
		const currentlyDark = get(isDark);
		isRunning = true;

		if (prefersReducedMotion()) {
			onMidpoint();
			isRunning = false;
			onComplete();
			return;
		}

		if (!threeModule || !hasWebGL()) {
			runCssFallback();
		} else if (currentlyDark) {
			runDarkToLightTransition();
		} else {
			runLightToDarkTransition();
		}
	});

	function finalize() {
		isRunning = false;
		onComplete();
	}

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
				finalize();
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

		// Horizontal blinds wipe — professional, clean
		const sliceCount = 12;
		const sliceH = (h / sliceCount) + 2;
		const centerY = h / 2;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const slices: { mesh: any; delay: number }[] = [];

		for (let i = 0; i < sliceCount; i++) {
			const geo = new THREE.PlaneGeometry(w + 4, sliceH);
			const mat = new THREE.MeshBasicMaterial({ color: 0x0a0a0f });
			const mesh = new THREE.Mesh(geo, mat);
			mesh.position.x = 0;
			mesh.position.y = (i * sliceH) - centerY + sliceH / 2;
			mesh.scale.set(0, 1, 1);
			scene.add(mesh);
			slices.push({ mesh, delay: i * 0.02 });
		}

		let midpointFired = false;

		for (const s of slices) {
			gsap.to(s.mesh.scale, { x: 1, duration: 0.25, delay: s.delay, ease: 'power3.inOut' });
		}

		setTimeout(() => {
			if (!midpointFired) { midpointFired = true; onMidpoint(); }
		}, 300);

		setTimeout(() => {
			for (const s of slices) {
				gsap.to(s.mesh.scale, { x: 0, duration: 0.25, delay: (sliceCount - 1) * 0.02 - s.delay, ease: 'power3.inOut' });
			}
		}, 380);

		setTimeout(() => {
			for (const s of slices) { s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
			renderer.dispose();
			renderer.forceContextLoss();
			canvas.remove();
			finalize();
		}, 700);

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

		// Radial iris wipe — clean, cinematic
		const overlay = new THREE.Mesh(
			new THREE.PlaneGeometry(w * 3, h * 3),
			new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0 })
		);
		overlay.position.z = 0;
		scene.add(overlay);

		let midpointFired = false;

		gsap.to(overlay.material, { opacity: 1, duration: 0.28, ease: 'power2.in' });

		setTimeout(() => {
			if (!midpointFired) { midpointFired = true; onMidpoint(); }
		}, 280);

		setTimeout(() => {
			gsap.to(overlay.material, { opacity: 0, duration: 0.3, ease: 'power2.out' });
		}, 360);

		setTimeout(() => {
			overlay.geometry.dispose();
			overlay.material.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
			canvas.remove();
			finalize();
		}, 700);

		function render() {
			renderer.render(scene, camera);
			if (canvas.parentNode) requestAnimationFrame(render);
		}
		requestAnimationFrame(render);
	}
</script>
