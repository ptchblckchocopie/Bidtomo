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

		if (cleanup) {
			cleanup();
			cleanup = null;
		}

		const [THREE, gsapModule] = await Promise.all([
			import('three'),
			import('gsap')
		]);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const gsap = (gsapModule as any).default || (gsapModule as any).gsap;

		const w = window.innerWidth;
		const h = window.innerHeight;
		const dpr = Math.min(window.devicePixelRatio, 2);

		const renderer = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			antialias: true,
			powerPreference: 'low-power'
		});
		renderer.setSize(w, h);
		renderer.setPixelRatio(dpr);
		renderer.setClearColor(0x000000, 0);

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
		camera.position.z = 30;

		const raycaster = new THREE.Raycaster();
		const mouse = new THREE.Vector2();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const interactives: any[] = [];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const tweens: any[] = [];

		if (dark) {
			setupDarkScene(THREE, gsap, scene, interactives, tweens);
		} else {
			setupLightScene(THREE, gsap, scene, interactives, tweens);
		}

		let cameraTargetX = 0;
		let cameraTargetY = 0;
		let time = 0;

		function animate() {
			time += 0.005;
			animationId = requestAnimationFrame(animate);

			cameraTargetX += (mouseNormX * 2 - cameraTargetX) * 0.02;
			cameraTargetY += (mouseNormY * 1.5 - cameraTargetY) * 0.02;
			camera.position.x = cameraTargetX;
			camera.position.y = cameraTargetY;
			camera.lookAt(0, 0, 0);

			// Raycaster interaction
			mouse.set(mouseNormX, mouseNormY);
			raycaster.setFromCamera(mouse, camera);

			if (interactives.length > 0) {
				const intersects = raycaster.intersectObjects(interactives, false);
				const hitSet = new Set(intersects.map((i: { object: unknown }) => i.object));

				for (const mesh of interactives) {
					const ud = mesh.userData;
					const isHit = hitSet.has(mesh);

					if (isHit && !ud.hovered) {
						ud.hovered = true;
						tweens.push(gsap.to(mesh.scale, {
							x: ud.baseScale * 1.15,
							y: ud.baseScale * 1.15,
							z: ud.baseScale * 1.15,
							duration: 0.3,
							ease: 'power2.out'
						}));

						if (dark) {
							tweens.push(gsap.to(mesh.material, {
								emissiveIntensity: 1.5,
								duration: 0.3,
								ease: 'power2.out'
							}));
						} else {
							mesh.material.color.setHex(0xFF3000);
						}
					} else if (!isHit && ud.hovered) {
						ud.hovered = false;
						tweens.push(gsap.to(mesh.scale, {
							x: ud.baseScale,
							y: ud.baseScale,
							z: ud.baseScale,
							duration: 0.4,
							ease: 'power2.out'
						}));

						if (dark) {
							tweens.push(gsap.to(mesh.material, {
								emissiveIntensity: 0.4,
								duration: 0.4,
								ease: 'power2.out'
							}));
						} else {
							mesh.material.color.setHex(ud.originalColor);
						}
					}
				}
			}

			// Animate individual objects
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
			});

			// Dark mode: particle repulsion
			if (dark) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				scene.traverse((obj: any) => {
					if (!obj.isPoints || !obj.userData.isParticleField) return;
					const geo = obj.geometry;
					const positions = geo.attributes.position.array as Float32Array;
					const originals = geo.userData.originalPositions as Float32Array;
					if (!originals) return;

					const mouseWorld = new THREE.Vector3(mouse.x, mouse.y, 0.5);
					mouseWorld.unproject(camera);
					const dir = mouseWorld.sub(camera.position).normalize();
					const dist = -camera.position.z / dir.z;
					const worldMouse = camera.position.clone().add(dir.multiplyScalar(dist));

					const repulsionRadius = 8;
					const repulsionStrength = 3;

					for (let i = 0; i < positions.length / 3; i++) {
						const ox = originals[i * 3];
						const oy = originals[i * 3 + 1];
						const oz = originals[i * 3 + 2];
						const dx = ox - worldMouse.x;
						const dy = oy - worldMouse.y;
						const d = Math.sqrt(dx * dx + dy * dy);

						if (d < repulsionRadius) {
							const force = (1 - d / repulsionRadius) * repulsionStrength;
							const angle = Math.atan2(dy, dx);
							positions[i * 3] += (ox + Math.cos(angle) * force - positions[i * 3]) * 0.1;
							positions[i * 3 + 1] += (oy + Math.sin(angle) * force - positions[i * 3 + 1]) * 0.1;
						} else {
							positions[i * 3] += (ox - positions[i * 3]) * 0.03;
							positions[i * 3 + 1] += (oy - positions[i * 3 + 1]) * 0.03;
						}
						positions[i * 3 + 2] += (oz - positions[i * 3 + 2]) * 0.03;
					}
					geo.attributes.position.needsUpdate = true;
				});
			}

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
			for (const t of tweens) t.kill();
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
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function setupLightScene(THREE: any, gsap: any, scene: any, interactives: any[], tweens: any[]) {
		// Swiss grid plane
		const gridHelper = new THREE.GridHelper(60, 30, 0x000000, 0x000000);
		gridHelper.position.y = -8;
		gridHelper.rotation.x = Math.PI * 0.05;
		gridHelper.material.opacity = 0.04;
		gridHelper.material.transparent = true;
		scene.add(gridHelper);

		const wireframeMat = () => new THREE.MeshBasicMaterial({
			color: 0x000000, wireframe: true, transparent: true, opacity: 0.08
		});

		const solidBlackMat = () => new THREE.MeshBasicMaterial({
			color: 0x000000, transparent: true, opacity: 0.06
		});

		const redAccentMat = () => new THREE.MeshBasicMaterial({
			color: 0xFF3000, transparent: true, opacity: 0.07
		});

		// Wireframe cube
		const cube1 = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), wireframeMat());
		cube1.position.set(12, 6, -5);
		cube1.userData = {
			baseScale: 1, hovered: false, originalColor: 0x000000,
			rotateSpeed: { x: 0.002, y: 0.003, z: 0.001 },
			floatAmplitude: 0.8, floatSpeed: 1.2, floatOffset: 0, baseY: 6
		};
		scene.add(cube1);
		interactives.push(cube1);

		// Large wireframe icosahedron
		const ico1 = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 0), wireframeMat());
		ico1.position.set(-14, 2, -8);
		ico1.userData = {
			baseScale: 1, hovered: false, originalColor: 0x000000,
			rotateSpeed: { x: 0.001, y: -0.002, z: 0.001 },
			floatAmplitude: 1.2, floatSpeed: 0.8, floatOffset: 2, baseY: 2
		};
		scene.add(ico1);
		interactives.push(ico1);

		// Structural black line
		const plane1 = new THREE.Mesh(
			new THREE.PlaneGeometry(6, 0.15),
			solidBlackMat()
		);
		plane1.position.set(5, -2, -3);
		plane1.rotation.z = -0.1;
		plane1.userData = {
			baseScale: 1, rotateSpeed: { x: 0, y: 0, z: 0 },
			floatAmplitude: 0.3, floatSpeed: 1.5, floatOffset: 1, baseY: -2
		};
		scene.add(plane1);

		// Swiss red ring
		const ring1 = new THREE.Mesh(new THREE.RingGeometry(1.5, 2, 32), redAccentMat());
		ring1.position.set(-6, -5, -4);
		ring1.userData = {
			baseScale: 1, hovered: false, originalColor: 0xFF3000,
			rotateSpeed: { x: 0, y: 0, z: -0.003 },
			floatAmplitude: 0.6, floatSpeed: 1, floatOffset: 3, baseY: -5
		};
		scene.add(ring1);
		interactives.push(ring1);

		// Wireframe octahedron
		const octa1 = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), wireframeMat());
		octa1.position.set(-10, 8, -6);
		octa1.userData = {
			baseScale: 1, hovered: false, originalColor: 0x000000,
			rotateSpeed: { x: -0.003, y: 0.002, z: 0 },
			floatAmplitude: 0.5, floatSpeed: 1.4, floatOffset: 4, baseY: 8
		};
		scene.add(octa1);
		interactives.push(octa1);

		// Wireframe torus
		const torus1 = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.3, 8, 24), wireframeMat());
		torus1.position.set(8, -4, -10);
		torus1.userData = {
			baseScale: 1, hovered: false, originalColor: 0x000000,
			rotateSpeed: { x: 0.001, y: 0.003, z: -0.001 },
			floatAmplitude: 1, floatSpeed: 0.6, floatOffset: 5, baseY: -4
		};
		scene.add(torus1);
		interactives.push(torus1);

		// Structural lines
		const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.05 });

		const lineGeo1 = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(18, -15, -12),
			new THREE.Vector3(18, 15, -12)
		]);
		scene.add(new THREE.LineSegments(lineGeo1, lineMat));

		const lineGeo2 = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(-20, 0, -12),
			new THREE.Vector3(20, 0, -12)
		]);
		scene.add(new THREE.LineSegments(lineGeo2, lineMat.clone()));

		const lineGeo3 = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(-18, -12, -12),
			new THREE.Vector3(-18, 12, -12)
		]);
		scene.add(new THREE.LineSegments(lineGeo3, lineMat.clone()));

		// Dot matrix particles
		const dotGeo = new THREE.BufferGeometry();
		const dotCount = 80;
		const dotPositions = new Float32Array(dotCount * 3);
		for (let i = 0; i < dotCount; i++) {
			dotPositions[i * 3] = (Math.random() - 0.5) * 50;
			dotPositions[i * 3 + 1] = (Math.random() - 0.5) * 30;
			dotPositions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 10;
		}
		dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3));
		const dotMat = new THREE.PointsMaterial({
			color: 0x000000, size: 0.08, transparent: true, opacity: 0.12, sizeAttenuation: true
		});
		const dots = new THREE.Points(dotGeo, dotMat);
		dots.userData = { rotateSpeed: { x: 0, y: 0.0005, z: 0 } };
		scene.add(dots);

		// Entrance animation
		for (const mesh of interactives) {
			const target = mesh.userData.baseScale;
			mesh.scale.set(0, 0, 0);
			tweens.push(gsap.to(mesh.scale, {
				x: target, y: target, z: target,
				duration: 0.6,
				delay: Math.random() * 0.4,
				ease: 'power2.out'
			}));
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function setupDarkScene(THREE: any, gsap: any, scene: any, interactives: any[], tweens: any[]) {
		// Lighting
		scene.add(new THREE.AmbientLight(0x111122, 0.5));

		const pl1 = new THREE.PointLight(0x5E6AD2, 2, 60);
		pl1.position.set(10, 10, 10);
		scene.add(pl1);

		const pl2 = new THREE.PointLight(0x785AD2, 1.5, 50);
		pl2.position.set(-15, -5, 5);
		scene.add(pl2);

		// Particle star field
		const particleCount = 600;
		const particleGeo = new THREE.BufferGeometry();
		const positions = new Float32Array(particleCount * 3);
		const originalPositions = new Float32Array(particleCount * 3);

		for (let i = 0; i < particleCount; i++) {
			const x = (Math.random() - 0.5) * 80;
			const y = (Math.random() - 0.5) * 50;
			const z = (Math.random() - 0.5) * 40 - 10;
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
			color: 0x8888cc, size: 0.12, transparent: true, opacity: 0.6,
			sizeAttenuation: true, blending: THREE.AdditiveBlending
		});

		const particles = new THREE.Points(particleGeo, particleMat);
		particles.userData = { isParticleField: true, rotateSpeed: { x: 0, y: 0.0003, z: 0 } };
		scene.add(particles);

		// Glowing polyhedra
		const makeEmissive = () => new THREE.MeshStandardMaterial({
			color: 0x2a2a4a, emissive: 0x5E6AD2, emissiveIntensity: 0.4,
			metalness: 0.8, roughness: 0.3, transparent: true, opacity: 0.7
		});

		const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), makeEmissive());
		ico.position.set(10, 4, -8);
		ico.userData = {
			baseScale: 1, hovered: false,
			rotateSpeed: { x: 0.003, y: 0.002, z: 0.001 },
			floatAmplitude: 1.5, floatSpeed: 0.7, floatOffset: 0, baseY: 4
		};
		scene.add(ico);
		interactives.push(ico);

		const octa = new THREE.Mesh(new THREE.OctahedronGeometry(2, 0), makeEmissive());
		octa.position.set(-12, -3, -6);
		octa.userData = {
			baseScale: 1, hovered: false,
			rotateSpeed: { x: -0.002, y: 0.004, z: 0 },
			floatAmplitude: 1, floatSpeed: 1.1, floatOffset: 2, baseY: -3
		};
		scene.add(octa);
		interactives.push(octa);

		const torusKnot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.5, 0.4, 64, 8), makeEmissive());
		torusKnot.position.set(-5, 7, -12);
		torusKnot.userData = {
			baseScale: 1, hovered: false,
			rotateSpeed: { x: 0.001, y: -0.003, z: 0.002 },
			floatAmplitude: 0.8, floatSpeed: 0.9, floatOffset: 4, baseY: 7
		};
		scene.add(torusKnot);
		interactives.push(torusKnot);

		const dodeca = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 0), makeEmissive());
		dodeca.position.set(14, -6, -10);
		dodeca.userData = {
			baseScale: 1, hovered: false,
			rotateSpeed: { x: 0.002, y: 0.001, z: -0.003 },
			floatAmplitude: 1.2, floatSpeed: 0.6, floatOffset: 1, baseY: -6
		};
		scene.add(dodeca);
		interactives.push(dodeca);

		// Wireframe sphere
		const wireSphere = new THREE.Mesh(
			new THREE.SphereGeometry(5, 16, 16),
			new THREE.MeshBasicMaterial({ color: 0x5E6AD2, wireframe: true, transparent: true, opacity: 0.03 })
		);
		wireSphere.position.set(0, 0, -15);
		wireSphere.userData = { rotateSpeed: { x: 0.0005, y: 0.001, z: 0 } };
		scene.add(wireSphere);

		// Entrance with elastic bounce
		for (const mesh of interactives) {
			const target = mesh.userData.baseScale;
			mesh.scale.set(0, 0, 0);
			tweens.push(gsap.to(mesh.scale, {
				x: target, y: target, z: target,
				duration: 0.8,
				delay: Math.random() * 0.5,
				ease: 'elastic.out(1, 0.5)'
			}));
		}
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
