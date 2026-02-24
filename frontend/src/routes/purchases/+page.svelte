<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    // Redirect to the unified dashboard with purchases tab
    goto('/dashboard?tab=purchases', { replaceState: true });
  });
</script>

<div class="text-center py-16 text-lg text-bh-fg/60">
  <p>Redirecting to Dashboard...</p>
</div>
