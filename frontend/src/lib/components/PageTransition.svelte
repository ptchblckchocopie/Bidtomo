<script lang="ts">
	import { page } from '$app/stores';
	import { fly, fade } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	let currentPath = $derived($page.url.pathname);
</script>

{#key currentPath}
	<div
		class="page-transition-wrapper"
		in:fly={{ y: 12, duration: 200, delay: 50 }}
		out:fade={{ duration: 100 }}
	>
		{@render children()}
	</div>
{/key}

<style>
	.page-transition-wrapper {
		width: 100%;
		min-height: 100%;
	}
</style>
