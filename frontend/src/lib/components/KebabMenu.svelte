<script lang="ts">
  let {
    items = [],
    onSelect
  }: {
    items?: Array<{
      label: string;
      action: string;
      show?: boolean;
      variant?: 'default' | 'danger';
      icon?: string;
    }>;
    onSelect?: (detail: { action: string }) => void;
  } = $props();

  let isOpen = $state(false);

  function toggle(event: MouseEvent) {
    event.stopPropagation();
    isOpen = !isOpen;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (isOpen && !target.closest('.kebab-menu-container')) {
      isOpen = false;
    }
  }

  function handleItemClick(action: string) {
    isOpen = false;
    onSelect?.({ action });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      isOpen = false;
    }
  }

  let visibleItems = $derived(items.filter(item => item.show !== false));
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="kebab-menu-container relative inline-block">
  <button
    class="kebab-btn flex items-center justify-center w-8 h-8 p-0 bg-transparent border border-transparent
           hover:border-[var(--color-border)] hover:bg-[var(--color-muted)]
           cursor-pointer transition-all duration-150"
    onclick={toggle}
    aria-label="More options"
    aria-expanded={isOpen}
  >
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" class="text-[var(--color-fg)]">
      <circle cx="10" cy="4" r="2" />
      <circle cx="10" cy="10" r="2" />
      <circle cx="10" cy="16" r="2" />
    </svg>
  </button>

  {#if isOpen}
    <div class="absolute right-0 top-full mt-1 min-w-[160px] z-[100] animate-fade-in
                border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
      {#each visibleItems as item}
        <button
          class="flex items-center gap-2 w-full px-3 py-2.5 bg-transparent border-none cursor-pointer
                 text-left text-sm font-medium transition-all duration-150
                 {item.variant === 'danger' ? 'text-[var(--color-red)] hover:bg-[var(--color-red)]/5' : 'text-[var(--color-fg)] hover:bg-[var(--color-muted)]'}"
          onclick={() => handleItemClick(item.action)}
        >
          {#if item.icon}
            <span class="text-base w-5 text-center">{item.icon}</span>
          {/if}
          <span class="flex-1">{item.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-4px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .animate-fade-in {
    animation: fade-in 0.15s ease-out;
  }
</style>
