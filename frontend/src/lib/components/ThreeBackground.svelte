<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { isDark } from '$lib/stores/theme';

	let container: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let cleanupFn: (() => void) | null = null;
	let initialized = false;
	let shouldBeActive = false;

	$effect(() => {
		shouldBeActive = $isDark;
		if (shouldBeActive && !initialized && browser) {
			init();
		} else if (!shouldBeActive && initialized) {
			cleanupFn?.();
			cleanupFn = null;
			initialized = false;
		}
	});

	onDestroy(() => {
		cleanupFn?.();
		cleanupFn = null;
		initialized = false;
	});

	async function init() {
		if (!browser || !container) return;

		// Skip for reduced motion
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		let THREE;
		try {
			THREE = await import('three');
		} catch {
			return;
		}

		// Check if we're still supposed to be active
		if (!shouldBeActive || !container) return;

		// Check WebGL support
		try {
			const testCanvas = document.createElement('canvas');
			if (!testCanvas.getContext('webgl2') && !testCanvas.getContext('webgl')) return;
		} catch {
			return;
		}

		initialized = true;

		const w = window.innerWidth;
		const h = window.innerHeight;
		const isMobile = w < 768;

		// Scene setup
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
		camera.position.z = 40;

		const renderer = new THREE.WebGLRenderer({
			alpha: true,
			antialias: !isMobile,
			powerPreference: 'low-power'
		});
		renderer.setSize(w, h);
		renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 1.5));
		renderer.setClearColor(0x000000, 0);
		container.appendChild(renderer.domElement);

		// Bauhaus colors
		const red = 0xff5555;
		const blue = 0x5b8def;
		const yellow = 0xffd24d;
		const colors = [red, blue, yellow];

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const shapes: {
			mesh: any;
			rotSpeed: { x: number; y: number; z: number };
			driftSpeed: { x: number; y: number };
		}[] = [];

		const shapeCount = isMobile ? 12 : 22;

		for (let i = 0; i < shapeCount; i++) {
			const color = colors[i % 3];
			const type = Math.floor(Math.random() * 4);
			const size = 0.8 + Math.random() * 2.5;
			const opacity = 0.04 + Math.random() * 0.07;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let mesh: any;

			if (type === 0) {
				// Wireframe box
				const boxGeo = new THREE.BoxGeometry(size, size, size);
				const edges = new THREE.EdgesGeometry(boxGeo);
				const mat = new THREE.LineBasicMaterial({
					color,
					transparent: true,
					opacity: opacity + 0.04
				});
				mesh = new THREE.LineSegments(edges, mat);
				boxGeo.dispose();
			} else if (type === 1) {
				// Ring (Bauhaus circle)
				const ringGeo = new THREE.RingGeometry(size * 0.7, size, 48);
				const mat = new THREE.MeshBasicMaterial({
					color,
					transparent: true,
					opacity,
					side: THREE.DoubleSide
				});
				mesh = new THREE.Mesh(ringGeo, mat);
			} else if (type === 2) {
				// Wireframe icosahedron
				const icoGeo = new THREE.IcosahedronGeometry(size, 1);
				const edges = new THREE.EdgesGeometry(icoGeo);
				const mat = new THREE.LineBasicMaterial({
					color,
					transparent: true,
					opacity: opacity + 0.04
				});
				mesh = new THREE.LineSegments(edges, mat);
				icoGeo.dispose();
			} else {
				// Wireframe triangle
				const triGeo = new THREE.BufferGeometry();
				const s = size;
				const vertices = new Float32Array([
					0, s, 0, -s * 0.866, -s * 0.5, 0, s * 0.866, -s * 0.5, 0, 0, s, 0
				]);
				triGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
				const mat = new THREE.LineBasicMaterial({
					color,
					transparent: true,
					opacity: opacity + 0.04
				});
				mesh = new THREE.Line(triGeo, mat);
			}

			mesh.position.set(
				(Math.random() - 0.5) * 60,
				(Math.random() - 0.5) * 40,
				(Math.random() - 0.5) * 30 - 5
			);
			mesh.rotation.set(
				Math.random() * Math.PI * 2,
				Math.random() * Math.PI * 2,
				Math.random() * Math.PI * 2
			);

			scene.add(mesh);
			shapes.push({
				mesh,
				rotSpeed: {
					x: (Math.random() - 0.5) * 0.003,
					y: (Math.random() - 0.5) * 0.003,
					z: (Math.random() - 0.5) * 0.002
				},
				driftSpeed: {
					x: (Math.random() - 0.5) * 0.006,
					y: (Math.random() - 0.5) * 0.004
				}
			});
		}

		// Starfield particles
		const particleCount = isMobile ? 40 : 80;
		const particlePositions = new Float32Array(particleCount * 3);
		for (let i = 0; i < particleCount; i++) {
			particlePositions[i * 3] = (Math.random() - 0.5) * 80;
			particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 60;
			particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 40 - 10;
		}
		const particleGeo = new THREE.BufferGeometry();
		particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
		const particleMat = new THREE.PointsMaterial({
			color: 0xffffff,
			size: isMobile ? 0.12 : 0.08,
			transparent: true,
			opacity: 0.25,
			sizeAttenuation: true
		});
		const particles = new THREE.Points(particleGeo, particleMat);
		scene.add(particles);

		// Mouse tracking for parallax
		let mouseX = 0;
		let mouseY = 0;
		const onMouseMove = (e: MouseEvent) => {
			mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
			mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
		};
		if (!isMobile) {
			window.addEventListener('mousemove', onMouseMove, { passive: true });
		}

		// Scroll for parallax
		let scrollY = 0;
		const onScroll = () => {
			scrollY = window.scrollY;
		};
		window.addEventListener('scroll', onScroll, { passive: true });

		// Resize handler
		const onResize = () => {
			const nw = window.innerWidth;
			const nh = window.innerHeight;
			camera.aspect = nw / nh;
			camera.updateProjectionMatrix();
			renderer.setSize(nw, nh);
		};
		window.addEventListener('resize', onResize);

		// Visibility
		let paused = false;
		const onVisChange = () => {
			paused = document.hidden;
		};
		document.addEventListener('visibilitychange', onVisChange);

		// Animation loop
		let animFrame: number;
		function animate() {
			animFrame = requestAnimationFrame(animate);
			if (paused) return;

			// Parallax camera
			camera.position.x += (mouseX * 3 - camera.position.x) * 0.015;
			camera.position.y += (-mouseY * 2 - scrollY * 0.006 - camera.position.y) * 0.015;
			camera.lookAt(0, -scrollY * 0.004, 0);

			// Rotate particles slowly
			particles.rotation.y += 0.0002;

			// Animate shapes
			for (const shape of shapes) {
				shape.mesh.rotation.x += shape.rotSpeed.x;
				shape.mesh.rotation.y += shape.rotSpeed.y;
				shape.mesh.rotation.z += shape.rotSpeed.z;
				shape.mesh.position.x += shape.driftSpeed.x;
				shape.mesh.position.y += shape.driftSpeed.y;

				// Wrap around
				if (shape.mesh.position.x > 35) shape.mesh.position.x = -35;
				if (shape.mesh.position.x < -35) shape.mesh.position.x = 35;
				if (shape.mesh.position.y > 25) shape.mesh.position.y = -25;
				if (shape.mesh.position.y < -25) shape.mesh.position.y = 25;
			}

			renderer.render(scene, camera);
		}
		animate();

		// Cleanup function
		cleanupFn = () => {
			cancelAnimationFrame(animFrame);
			if (!isMobile) window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
			document.removeEventListener('visibilitychange', onVisChange);

			for (const s of shapes) {
				s.mesh.geometry.dispose();
				if (Array.isArray(s.mesh.material)) {
					s.mesh.material.forEach((m: any) => m.dispose());
				} else {
					s.mesh.material.dispose();
				}
			}
			particleGeo.dispose();
			particleMat.dispose();

			renderer.dispose();
			renderer.forceContextLoss();
			if (renderer.domElement.parentNode === container) {
				container.removeChild(renderer.domElement);
			}
		};
	}
</script>

<div bind:this={container} class="three-bg"></div>

<style>
	.three-bg {
		position: fixed;
		inset: 0;
		z-index: 0;
		pointer-events: none;
	}

	.three-bg :global(canvas) {
		display: block;
	}
</style>
