<script lang="ts">
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

	let isRunning = $state(false);

	// Store toggle button position for ripple origin
	let rippleX = 0;
	let rippleY = 0;

	$effect(() => {
		if (!active || !browser || isRunning) return;

		const currentlyDark = get(isDark);
		isRunning = true;

		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			onMidpoint();
			isRunning = false;
			onComplete();
			return;
		}

		// Find the toggle button position for ripple origin
		const toggleBtn = document.querySelector('.theme-toggle');
		if (toggleBtn) {
			const rect = toggleBtn.getBoundingClientRect();
			rippleX = rect.left + rect.width / 2;
			rippleY = rect.top + rect.height / 2;
		} else {
			rippleX = window.innerWidth / 2;
			rippleY = 0;
		}

		runRippleTransition(currentlyDark);
	});

	function runRippleTransition(fromDark: boolean) {
		// The ripple expands from the toggle button with the NEW theme color
		const newColor = fromDark ? '#FFFFFF' : '#000000';

		// Calculate max radius needed to cover entire viewport from ripple origin
		const maxX = Math.max(rippleX, window.innerWidth - rippleX);
		const maxY = Math.max(rippleY, window.innerHeight - rippleY);
		const maxRadius = Math.sqrt(maxX * maxX + maxY * maxY);

		// Create the ripple overlay
		const overlay = document.createElement('div');
		overlay.className = 'theme-ripple-overlay';
		overlay.style.cssText = `
			position: fixed;
			inset: 0;
			z-index: 99999;
			pointer-events: none;
			overflow: hidden;
		`;

		const ripple = document.createElement('div');
		ripple.style.cssText = `
			position: absolute;
			left: ${rippleX}px;
			top: ${rippleY}px;
			width: 0;
			height: 0;
			border-radius: 50%;
			background: ${newColor};
			transform: translate(-50%, -50%);
			transition: width 500ms cubic-bezier(0.4, 0, 0.2, 1),
			            height 500ms cubic-bezier(0.4, 0, 0.2, 1),
			            opacity 200ms ease-out 400ms;
			opacity: 1;
		`;

		overlay.appendChild(ripple);
		document.body.appendChild(overlay);

		// Phase 1: Expand the ripple
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const diameter = maxRadius * 2.2;
				ripple.style.width = `${diameter}px`;
				ripple.style.height = `${diameter}px`;
			});
		});

		// Phase 2: Toggle theme when ripple covers ~60% of screen
		setTimeout(() => {
			onMidpoint();
		}, 280);

		// Phase 3: Fade out ripple after theme has applied
		setTimeout(() => {
			ripple.style.opacity = '0';
		}, 480);

		// Phase 4: Cleanup
		setTimeout(() => {
			overlay.remove();
			isRunning = false;
			onComplete();
		}, 700);
	}
</script>
