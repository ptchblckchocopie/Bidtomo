<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let animId: number;
	let particles: Particle[] = [];
	let mouseX = -1000;
	let mouseY = -1000;
	let width = 0;
	let height = 0;

	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		size: number;
		opacity: number;
		opacityDir: number;
		hue: number;
		pulse: number;
		pulseSpeed: number;
	}

	function createParticle(): Particle {
		return {
			x: Math.random() * width,
			y: Math.random() * height,
			vx: (Math.random() - 0.5) * 0.3,
			vy: (Math.random() - 0.5) * 0.3 - 0.1,
			size: Math.random() * 2 + 0.5,
			opacity: Math.random() * 0.4 + 0.05,
			opacityDir: Math.random() > 0.5 ? 1 : -1,
			hue: Math.random() * 60 + 180, // blue-cyan-teal range
			pulse: Math.random() * Math.PI * 2,
			pulseSpeed: Math.random() * 0.02 + 0.005,
		};
	}

	function init() {
		if (!canvas) return;
		ctx = canvas.getContext('2d');
		resize();
		const count = Math.min(Math.floor((width * height) / 25000), 60);
		particles = Array.from({ length: count }, createParticle);
	}

	function resize() {
		width = window.innerWidth;
		height = window.innerHeight;
		if (canvas) {
			canvas.width = width * Math.min(window.devicePixelRatio, 2);
			canvas.height = height * Math.min(window.devicePixelRatio, 2);
			canvas.style.width = width + 'px';
			canvas.style.height = height + 'px';
			ctx?.scale(Math.min(window.devicePixelRatio, 2), Math.min(window.devicePixelRatio, 2));
		}
	}

	function animate() {
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);

		for (const p of particles) {
			// Mouse repulsion
			const dx = p.x - mouseX;
			const dy = p.y - mouseY;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < 150) {
				const force = (150 - dist) / 150 * 0.5;
				p.vx += (dx / dist) * force;
				p.vy += (dy / dist) * force;
			}

			// Damping
			p.vx *= 0.99;
			p.vy *= 0.99;

			p.x += p.vx;
			p.y += p.vy;
			p.pulse += p.pulseSpeed;

			// Wrap around
			if (p.x < -10) p.x = width + 10;
			if (p.x > width + 10) p.x = -10;
			if (p.y < -10) p.y = height + 10;
			if (p.y > height + 10) p.y = -10;

			// Pulsing opacity
			const pulseOpacity = p.opacity + Math.sin(p.pulse) * 0.15;
			const finalOpacity = Math.max(0.02, Math.min(0.5, pulseOpacity));

			// Draw glow
			const glowSize = p.size * 8;
			const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
			gradient.addColorStop(0, `hsla(${p.hue}, 70%, 70%, ${finalOpacity * 0.6})`);
			gradient.addColorStop(0.4, `hsla(${p.hue}, 60%, 60%, ${finalOpacity * 0.2})`);
			gradient.addColorStop(1, `hsla(${p.hue}, 50%, 50%, 0)`);
			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
			ctx.fill();

			// Draw core
			ctx.fillStyle = `hsla(${p.hue}, 80%, 85%, ${finalOpacity})`;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
			ctx.fill();
		}

		// Draw connections between close particles
		for (let i = 0; i < particles.length; i++) {
			for (let j = i + 1; j < particles.length; j++) {
				const dx = particles[i].x - particles[j].x;
				const dy = particles[i].y - particles[j].y;
				const dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < 120) {
					const opacity = (1 - dist / 120) * 0.08;
					ctx.strokeStyle = `rgba(140, 180, 220, ${opacity})`;
					ctx.lineWidth = 0.5;
					ctx.beginPath();
					ctx.moveTo(particles[i].x, particles[i].y);
					ctx.lineTo(particles[j].x, particles[j].y);
					ctx.stroke();
				}
			}
		}

		animId = requestAnimationFrame(animate);
	}

	function onMouseMove(e: MouseEvent) {
		mouseX = e.clientX;
		mouseY = e.clientY;
	}

	onMount(() => {
		if (!browser) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		// Skip on low-end devices
		if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return;

		init();
		animId = requestAnimationFrame(animate);
		window.addEventListener('resize', resize);
		window.addEventListener('mousemove', onMouseMove);
	});

	onDestroy(() => {
		if (!browser) return;
		cancelAnimationFrame(animId);
		window.removeEventListener('resize', resize);
		window.removeEventListener('mousemove', onMouseMove);
	});
</script>

<canvas bind:this={canvas} class="floating-particles" aria-hidden="true"></canvas>

<style>
	.floating-particles {
		position: fixed;
		inset: 0;
		z-index: 1;
		pointer-events: none;
		opacity: 0.7;
	}
</style>
