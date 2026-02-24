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

<div class="kebab-menu-container">
  <button
    class="kebab-btn"
    onclick={toggle}
    aria-label="More options"
    aria-expanded={isOpen}
  >
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <circle cx="10" cy="4" r="2" />
      <circle cx="10" cy="10" r="2" />
      <circle cx="10" cy="16" r="2" />
    </svg>
  </button>

  {#if isOpen}
    <div class="dropdown-menu">
      {#each visibleItems as item}
        <button
          class="menu-item"
          class:danger={item.variant === 'danger'}
          onclick={() => handleItemClick(item.action)}
        >
          {#if item.icon}
            <span class="item-icon">{item.icon}</span>
          {/if}
          <span class="item-label">{item.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .kebab-menu-container {
    position: relative;
    display: inline-block;
  }

  .kebab-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    color: #6b7280;
    transition: all 0.2s;
  }

  .kebab-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .kebab-btn:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.2);
  }

  .dropdown-menu {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 4px;
    min-width: 160px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border: 1px solid #e5e7eb;
    padding: 4px;
    z-index: 100;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    font-size: 14px;
    color: #374151;
    transition: all 0.15s;
  }

  .menu-item:hover {
    background: #f3f4f6;
  }

  .menu-item.danger {
    color: #dc2626;
  }

  .menu-item.danger:hover {
    background: #fef2f2;
  }

  .item-icon {
    font-size: 16px;
    width: 20px;
    text-align: center;
  }

  .item-label {
    flex: 1;
  }
</style>
