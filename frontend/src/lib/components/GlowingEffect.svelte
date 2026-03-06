<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let {
		blur = 0,
		inactiveZone = 0.7,
		proximity = 0,
		spread = 20,
		variant = 'default',
		glow = false,
		className = '',
		disabled = true,
		movementDuration = 2,
		borderWidth = 1,
	}: {
		blur?: number;
		inactiveZone?: number;
		proximity?: number;
		spread?: number;
		variant?: 'default' | 'white';
		glow?: boolean;
		className?: string;
		disabled?: boolean;
		movementDuration?: number;
		borderWidth?: number;
	} = $props();

	let containerRef: HTMLDivElement | undefined = $state();
	let lastPosition = { x: 0, y: 0 };
	let animationFrameId = 0;
	let lerpFrameId = 0;

	function handleMove(e?: PointerEvent | { x: number; y: number }) {
		if (!containerRef) return;

		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}

		animationFrameId = requestAnimationFrame(() => {
			const el = containerRef;
			if (!el) return;

			const { left, top, width, height } = el.getBoundingClientRect();
			const mouseX = e?.x ?? lastPosition.x;
			const mouseY = e?.y ?? lastPosition.y;

			if (e) {
				lastPosition = { x: mouseX, y: mouseY };
			}

			const centerX = left + width * 0.5;
			const centerY = top + height * 0.5;
			const distanceFromCenter = Math.hypot(mouseX - centerX, mouseY - centerY);
			const inactiveRadius = 0.5 * Math.min(width, height) * inactiveZone;

			if (distanceFromCenter < inactiveRadius) {
				el.style.setProperty('--active', '0');
				return;
			}

			const isActive =
				mouseX > left - proximity &&
				mouseX < left + width + proximity &&
				mouseY > top - proximity &&
				mouseY < top + height + proximity;

			el.style.setProperty('--active', isActive ? '1' : '0');

			if (!isActive) return;

			const currentAngle = parseFloat(el.style.getPropertyValue('--start')) || 0;
			let targetAngle =
				(180 * Math.atan2(mouseY - centerY, mouseX - centerX)) / Math.PI + 90;

			const angleDiff = ((targetAngle - currentAngle + 180) % 360) - 180;
			const newAngle = currentAngle + angleDiff;

			startLerp(currentAngle, newAngle);
		});
	}

	function startLerp(from: number, to: number) {
		if (lerpFrameId) cancelAnimationFrame(lerpFrameId);

		const duration = movementDuration * 1000;
		const startTime = performance.now();

		function step(now: number) {
			const elapsed = now - startTime;
			const progress = Math.min(elapsed / duration, 1);
			// Cubic ease-out: matches motion/react's [0.16, 1, 0.3, 1] roughly
			const eased = 1 - Math.pow(1 - progress, 3);
			const value = from + (to - from) * eased;

			if (containerRef) {
				containerRef.style.setProperty('--start', String(value));
			}

			if (progress < 1) {
				lerpFrameId = requestAnimationFrame(step);
			}
		}

		lerpFrameId = requestAnimationFrame(step);
	}

	onMount(() => {
		if (!browser || disabled) return;

		const handleScroll = () => handleMove();
		const handlePointerMove = (e: PointerEvent) => handleMove(e);

		window.addEventListener('scroll', handleScroll, { passive: true });
		document.body.addEventListener('pointermove', handlePointerMove, { passive: true });

		return () => {
			if (animationFrameId) cancelAnimationFrame(animationFrameId);
			if (lerpFrameId) cancelAnimationFrame(lerpFrameId);
			window.removeEventListener('scroll', handleScroll);
			document.body.removeEventListener('pointermove', handlePointerMove);
		};
	});
</script>

<!-- Static border fallback (shown when disabled) -->
{#if disabled}
<div
	class="pointer-events-none absolute -inset-px rounded-[inherit] border opacity-0 transition-opacity hidden"
	class:opacity-100={glow}
	class:border-white={variant === 'white'}
	class:!block={disabled}
></div>
{/if}

<!-- Animated glow container -->
{#if !disabled}
<div
	bind:this={containerRef}
	class="glow-container pointer-events-none absolute inset-0 rounded-[inherit] opacity-100 transition-opacity {className}"
	class:opacity-100={glow}
	class:glow-blur={blur > 0}
	style:--blur="{blur}px"
	style:--spread={spread}
	style:--start="0"
	style:--active="0"
	style:--glowingeffect-border-width="{borderWidth}px"
	style:--repeating-conic-gradient-times="5"
	style:--gradient={variant === 'white'
		? `repeating-conic-gradient(from 236.84deg at 50% 50%, #000, #000 calc(25% / var(--repeating-conic-gradient-times)))`
		: `radial-gradient(circle, #10B981 10%, #10B98100 20%),
		   radial-gradient(circle at 40% 40%, #3B82F6 5%, #3B82F600 15%),
		   radial-gradient(circle at 60% 60%, #6366F1 10%, #6366F100 20%),
		   radial-gradient(circle at 40% 60%, #8B5CF6 10%, #8B5CF600 20%),
		   repeating-conic-gradient(
		     from 236.84deg at 50% 50%,
		     #10B981 0%,
		     #3B82F6 calc(25% / var(--repeating-conic-gradient-times)),
		     #6366F1 calc(50% / var(--repeating-conic-gradient-times)),
		     #8B5CF6 calc(75% / var(--repeating-conic-gradient-times)),
		     #10B981 calc(100% / var(--repeating-conic-gradient-times))
		   )`}
>
	<div class="glow-effect rounded-[inherit]"></div>
</div>
{/if}

<style>
	.glow-blur {
		filter: blur(var(--blur));
	}

	.glow-effect {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.glow-effect::after {
		content: '';
		position: absolute;
		inset: calc(-1 * var(--glowingeffect-border-width));
		border: var(--glowingeffect-border-width) solid transparent;
		border-radius: inherit;
		background: var(--gradient);
		background-attachment: fixed;
		opacity: var(--active);
		transition: opacity 300ms;

		/* Mask: intersect a solid fill (padding-box) with a conic spotlight (border-box)
		   to produce a glowing border that follows the cursor */
		-webkit-mask-clip: padding-box, border-box;
		mask-clip: padding-box, border-box;
		-webkit-mask-composite: source-in;
		mask-composite: intersect;
		-webkit-mask-image:
			linear-gradient(#0000, #0000),
			conic-gradient(
				from calc((var(--start) - var(--spread)) * 1deg),
				#00000000 0deg,
				#fff,
				#00000000 calc(var(--spread) * 2deg)
			);
		mask-image:
			linear-gradient(#0000, #0000),
			conic-gradient(
				from calc((var(--start) - var(--spread)) * 1deg),
				#00000000 0deg,
				#fff,
				#00000000 calc(var(--spread) * 2deg)
			);
	}
</style>
