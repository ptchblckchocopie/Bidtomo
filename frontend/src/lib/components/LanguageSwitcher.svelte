<script lang="ts">
  import { localeStore } from '$lib/stores/locale';
  import { LOCALES, type Locale } from '$lib/i18n';

  let open = $state(false);
  let currentLocale = $state<Locale>('en');

  localeStore.subscribe((v) => { currentLocale = v; });

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    open = !open;
  }

  function select(locale: Locale) {
    localeStore.set(locale);
    open = false;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (open && !target.closest('.lang-switcher')) {
      open = false;
    }
  }

  const currentLabel = $derived(
    LOCALES.find((l) => l.code === currentLocale)?.nativeLabel || 'EN'
  );
</script>

<svelte:window onclick={handleClickOutside} />

<div class="lang-switcher">
  <button
    class="lang-toggle"
    onclick={toggle}
    aria-label="Change language"
    aria-expanded={open}
  >
    <svg class="lang-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
    <span class="lang-code">{currentLocale.toUpperCase()}</span>
  </button>

  {#if open}
    <div class="lang-dropdown">
      {#each LOCALES as locale}
        <button
          class="lang-option"
          class:active={locale.code === currentLocale}
          onclick={() => select(locale.code)}
        >
          <span class="lang-option-native">{locale.nativeLabel}</span>
          {#if locale.code !== 'en'}
            <span class="lang-option-english">{locale.label}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .lang-switcher {
    position: relative;
  }

  .lang-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.375rem 0.625rem;
    min-height: 36px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-muted-fg);
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s;
    letter-spacing: 0.5px;
  }

  .lang-toggle:hover {
    color: var(--color-fg);
    border-color: var(--color-fg);
    background: var(--color-surface);
  }

  .lang-icon {
    width: 14px;
    height: 14px;
  }

  .lang-code {
    line-height: 1;
  }

  .lang-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    min-width: 180px;
    padding: 0.375rem;
    background: rgba(19, 19, 22, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.03);
    animation: langDropIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: top right;
    z-index: 100;
  }

  @keyframes langDropIn {
    from { opacity: 0; transform: translateY(-6px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .lang-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.5rem 0.75rem;
    min-height: 44px;
    font-size: 0.8rem;
    color: var(--color-muted-fg);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }

  .lang-option:hover {
    background: var(--color-surface-hover);
    color: var(--color-fg);
  }

  .lang-option.active {
    color: var(--color-fg);
    font-weight: 600;
  }

  .lang-option-native {
    font-weight: 500;
  }

  .lang-option-english {
    font-size: 0.7rem;
    opacity: 0.5;
  }

  /* Mobile: dropdown opens left-aligned, full width in mobile menu context */
  @media (max-width: 860px) {
    .lang-toggle {
      min-height: 44px;
      padding: 0.5rem 0.75rem;
      font-size: 0.8rem;
    }

    .lang-icon {
      width: 16px;
      height: 16px;
    }

    .lang-dropdown {
      left: 0;
      right: auto;
      min-width: 200px;
      transform-origin: top left;
    }
  }
</style>
