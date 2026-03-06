<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';

	let cursor: HTMLDivElement;
	let dot: HTMLDivElement;
	let mouseX = -100;
	let mouseY = -100;
	let cursorX = -100;
	let cursorY = -100;
	let dotX = -100;
	let dotY = -100;
	let scale = 1;
	let targetScale = 1;
	let opacity = 0;
	let animId: number;
	let isTouch = false;

	function onMouseMove(e: MouseEvent) {
		mouseX = e.clientX;
		mouseY = e.clientY;
		if (opacity === 0) opacity = 1;
	}

	function onMouseEnter() {
		opacity = 1;
	}

	function onMouseLeave() {
		opacity = 0;
	}

	function onTouchStart() {
		isTouch = true;
		opacity = 0;
	}

	function checkHover(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target) return;

		const interactive = target.closest('a, button, [role="button"], input, select, textarea, .card-bh, .btn-bh, .btn-bh-red, .btn-bh-outline, [data-cursor="grow"]');
		if (interactive) {
			targetScale = 2.5;
		} else {
			targetScale = 1;
		}
	}

	function animate() {
		// Smooth follow — outer ring (slower)
		cursorX += (mouseX - cursorX) * 0.12;
		cursorY += (mouseY - cursorY) * 0.12;

		// Dot follows faster
		dotX += (mouseX - dotX) * 0.25;
		dotY += (mouseY - dotY) * 0.25;

		// Scale interpolation
		scale += (targetScale - scale) * 0.15;

		if (cursor) {
			cursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0) translate(-50%, -50%) scale(${scale})`;
			cursor.style.opacity = String(opacity);
		}
		if (dot) {
			dot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0) translate(-50%, -50%)`;
			dot.style.opacity = String(opacity);
		}

		animId = requestAnimationFrame(animate);
	}

	onMount(() => {
		if (!browser) return;

		// Don't show on touch devices
		if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
			isTouch = true;
			return;
		}

		// Check for reduced motion preference
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mousemove', checkHover);
		document.addEventListener('mouseenter', onMouseEnter);
		document.addEventListener('mouseleave', onMouseLeave);
		window.addEventListener('touchstart', onTouchStart, { once: true });

		animId = requestAnimationFrame(animate);
	});

	onDestroy(() => {
		if (!browser) return;
		cancelAnimationFrame(animId);
		window.removeEventListener('mousemove', onMouseMove);
		window.removeEventListener('mousemove', checkHover);
		document.removeEventListener('mouseenter', onMouseEnter);
		document.removeEventListener('mouseleave', onMouseLeave);
	});
</script>

{#if !isTouch}
	<div bind:this={dot} class="cursor-dot" aria-hidden="true"></div>
	<div bind:this={cursor} class="cursor-ring" aria-hidden="true"></div>
{/if}

<style>
	.cursor-dot {
		position: fixed;
		top: 0;
		left: 0;
		width: 5px;
		height: 5px;
		background: var(--color-fg);
		border-radius: 50%;
		pointer-events: none;
		z-index: 10001;
		opacity: 0;
		will-change: transform, opacity;
		mix-blend-mode: difference;
	}

	.cursor-ring {
		position: fixed;
		top: 0;
		left: 0;
		width: 28px;
		height: 28px;
		border: 1px solid var(--color-fg);
		border-radius: 50%;
		pointer-events: none;
		z-index: 10000;
		opacity: 0;
		will-change: transform, opacity;
		transition: border-color 0.3s;
		mix-blend-mode: difference;
	}

	@media (hover: none), (pointer: coarse) {
		.cursor-dot,
		.cursor-ring {
			display: none !important;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.cursor-dot,
		.cursor-ring {
			display: none !important;
		}
	}
</style>
