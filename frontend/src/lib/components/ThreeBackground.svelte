<script lang="ts">
	import { isDark } from '$lib/stores/theme';
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';

	let canvas: HTMLCanvasElement;
	let animationId: number;
	let cleanup: (() => void) | null = null;
	let currentMode: boolean | null = null;

	let mouseNormX = 0;
	let mouseNormY = 0;

	function handleMouseMove(e: MouseEvent) {
		mouseNormX = (e.clientX / window.innerWidth) * 2 - 1;
		mouseNormY = -(e.clientY / window.innerHeight) * 2 + 1;
	}

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

	async function initScene(dark: boolean) {
		if (!browser || !canvas || prefersReducedMotion() || !hasWebGL()) return;

		if (cleanup) { cleanup(); cleanup = null; }

		const THREE = await import('three');

		const w = window.innerWidth;
		const h = window.innerHeight;

		const renderer = new THREE.WebGLRenderer({
			canvas, alpha: true, antialias: false, powerPreference: 'low-power'
		});
		renderer.setSize(w, h);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
		renderer.setClearColor(0x000000, 0);

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
		camera.position.z = 50;

		let time = 0;
		let cameraX = 0;
		let cameraY = 0;

		if (dark) {
			setupDarkScene(THREE, scene);
		} else {
			setupLightScene(THREE, scene);
		}

		function animate() {
			time += 0.003;
			animationId = requestAnimationFrame(animate);

			// Extremely subtle camera parallax
			cameraX += (mouseNormX * 0.8 - cameraX) * 0.015;
			cameraY += (mouseNormY * 0.5 - cameraY) * 0.015;
			camera.position.x = cameraX;
			camera.position.y = cameraY;
			camera.lookAt(0, 0, 0);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			scene.traverse((obj: any) => {
				const ud = obj.userData;
				if (ud.rotateSpeed) {
					obj.rotation.x += ud.rotateSpeed.x;
					obj.rotation.y += ud.rotateSpeed.y;
					obj.rotation.z += ud.rotateSpeed.z;
				}
				if (ud.floatAmplitude) {
					obj.position.y = ud.baseY + Math.sin(time * ud.floatSpeed + ud.floatOffset) * ud.floatAmplitude;
				}

				// Dark mode particle drift
				if (obj.isPoints && ud.isParticleField) {
					const positions = obj.geometry.attributes.position.array as Float32Array;
					const originals = obj.geometry.userData.originalPositions as Float32Array;
					if (!originals) return;

					// Gentle mouse-aware drift (not repulsion)
					const mx = mouseNormX * 15;
					const my = mouseNormY * 10;

					for (let i = 0; i < positions.length / 3; i++) {
						const ox = originals[i * 3];
						const oy = originals[i * 3 + 1];

						// Very gentle parallax offset based on depth
						const depth = (originals[i * 3 + 2] + 30) / 60;
						const px = ox + mx * depth * 0.03;
						const py = oy + my * depth * 0.03;

						positions[i * 3] += (px - positions[i * 3]) * 0.01;
						positions[i * 3 + 1] += (py - positions[i * 3 + 1]) * 0.01;
					}
					obj.geometry.attributes.position.needsUpdate = true;
				}
			});

			renderer.render(scene, camera);
		}

		animationId = requestAnimationFrame(animate);

		function onResize() {
			const w = window.innerWidth;
			const h = window.innerHeight;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
		}

		window.addEventListener('resize', onResize);

		cleanup = () => {
			cancelAnimationFrame(animationId);
			window.removeEventListener('resize', onResize);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			scene.traverse((obj: any) => {
				if (obj.geometry) obj.geometry.dispose();
				if (obj.material) {
					if (Array.isArray(obj.material)) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						obj.material.forEach((m: any) => m.dispose());
					} else {
						obj.material.dispose();
					}
				}
			});
			renderer.dispose();
			renderer.forceContextLoss();
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function setupLightScene(THREE: any, scene: any) {
		// Minimal: just a faint grid and a few barely-visible structural lines
		// The content is king — background should be nearly invisible

		const gridHelper = new THREE.GridHelper(120, 60, 0x000000, 0x000000);
		gridHelper.position.y = -15;
		gridHelper.rotation.x = Math.PI * 0.03;
		gridHelper.material.opacity = 0.018;
		gridHelper.material.transparent = true;
		gridHelper.userData = { rotateSpeed: { x: 0, y: 0.0001, z: 0 } };
		scene.add(gridHelper);

		// Sparse dot field — like distant data points
		const dotGeo = new THREE.BufferGeometry();
		const dotCount = 40;
		const dotPositions = new Float32Array(dotCount * 3);
		for (let i = 0; i < dotCount; i++) {
			dotPositions[i * 3] = (Math.random() - 0.5) * 80;
			dotPositions[i * 3 + 1] = (Math.random() - 0.5) * 50;
			dotPositions[i * 3 + 2] = (Math.random() - 0.5) * 30 - 15;
		}
		dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3));
		const dotMat = new THREE.PointsMaterial({
			color: 0x000000, size: 0.06, transparent: true, opacity: 0.06, sizeAttenuation: true
		});
		scene.add(new THREE.Points(dotGeo, dotMat));

		// Two thin structural lines — barely there
		const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.025 });
		const vLine = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(25, -30, -20),
			new THREE.Vector3(25, 30, -20)
		]);
		scene.add(new THREE.LineSegments(vLine, lineMat));

		const hLine = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(-40, -5, -20),
			new THREE.Vector3(40, -5, -20)
		]);
		scene.add(new THREE.LineSegments(hLine, lineMat.clone()));
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function setupDarkScene(THREE: any, scene: any) {
		// Subtle particle field — like distant stars, very restrained
		const particleCount = 300;
		const particleGeo = new THREE.BufferGeometry();
		const positions = new Float32Array(particleCount * 3);
		const originalPositions = new Float32Array(particleCount * 3);

		for (let i = 0; i < particleCount; i++) {
			const x = (Math.random() - 0.5) * 100;
			const y = (Math.random() - 0.5) * 60;
			const z = (Math.random() - 0.5) * 60 - 15;
			positions[i * 3] = x;
			positions[i * 3 + 1] = y;
			positions[i * 3 + 2] = z;
			originalPositions[i * 3] = x;
			originalPositions[i * 3 + 1] = y;
			originalPositions[i * 3 + 2] = z;
		}

		particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		particleGeo.userData = { originalPositions };

		const particleMat = new THREE.PointsMaterial({
			color: 0x6670d0, size: 0.08, transparent: true, opacity: 0.35,
			sizeAttenuation: true, blending: THREE.AdditiveBlending
		});

		const particles = new THREE.Points(particleGeo, particleMat);
		particles.userData = { isParticleField: true, rotateSpeed: { x: 0, y: 0.0002, z: 0 } };
		scene.add(particles);

		// Very faint wireframe sphere — architectural presence
		const wireSphere = new THREE.Mesh(
			new THREE.SphereGeometry(8, 24, 24),
			new THREE.MeshBasicMaterial({ color: 0x5E6AD2, wireframe: true, transparent: true, opacity: 0.015 })
		);
		wireSphere.position.set(0, 0, -20);
		wireSphere.userData = { rotateSpeed: { x: 0.0003, y: 0.0005, z: 0 } };
		scene.add(wireSphere);
	}

	onMount(() => {
		if (!browser) return;
		window.addEventListener('mousemove', handleMouseMove);
	});

	onDestroy(() => {
		if (browser) window.removeEventListener('mousemove', handleMouseMove);
		if (cleanup) { cleanup(); cleanup = null; }
	});

	$effect(() => {
		const dark = $isDark;
		if (!browser || !canvas) return;
		if (currentMode === dark) return;
		currentMode = dark;
		initScene(dark);
	});
</script>

<canvas bind:this={canvas} class="three-bg" aria-hidden="true"></canvas>

<style>
	.three-bg {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: 0;
		pointer-events: none;
	}
</style>
