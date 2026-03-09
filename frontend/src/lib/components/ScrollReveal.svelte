<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	let {
		children,
		threshold = 0.1,
		delay = 0,
		direction = 'up',
		distance = 30,
		duration = 600,
		once = true,
		class: className = ''
	}: {
		children: Snippet;
		threshold?: number;
		delay?: number;
		direction?: 'up' | 'down' | 'left' | 'right' | 'none';
		distance?: number;
		duration?: number;
		once?: boolean;
		class?: string;
	} = $props();

	let el: HTMLDivElement;
	let visible = $state(false);

	const transforms: Record<string, string> = {
		up: `translateY(${distance}px)`,
		down: `translateY(-${distance}px)`,
		left: `translateX(${distance}px)`,
		right: `translateX(-${distance}px)`,
		none: 'none',
	};

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			visible = true;
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						visible = true;
						if (once) observer.unobserve(el);
					} else if (!once) {
						visible = false;
					}
				}
			},
			{ threshold }
		);

		observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<div
	bind:this={el}
	class="scroll-reveal {className}"
	style="
		opacity: {visible ? 1 : 0};
		transform: {visible ? 'none' : transforms[direction]};
		transition: opacity {duration}ms cubic-bezier(0.4, 0, 0.2, 1) {delay}ms, transform {duration}ms cubic-bezier(0.4, 0, 0.2, 1) {delay}ms;
	"
>
	{@render children()}
</div>

<style>
	.scroll-reveal {
		will-change: opacity, transform;
	}
</style>
