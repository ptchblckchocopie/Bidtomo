<script lang="ts">
  let {
    keywords = $bindable([]),
    disabled = false,
    placeholder = "Type keywords and press comma..."
  }: {
    keywords?: string[];
    disabled?: boolean;
    placeholder?: string;
  } = $props();

  let inputValue = $state('');

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      addKeyword();
    } else if (e.key === 'Backspace' && inputValue === '' && keywords.length > 0) {
      // Remove last keyword when backspace is pressed on empty input
      removeKeyword(keywords.length - 1);
    }
  }

  function addKeyword() {
    const trimmedValue = inputValue.trim();

    // Remove trailing comma if present
    const cleanValue = trimmedValue.replace(/,+$/, '').trim();

    if (cleanValue && !keywords.includes(cleanValue)) {
      keywords = [...keywords, cleanValue];
      inputValue = '';
    } else {
      inputValue = '';
    }
  }

  function removeKeyword(index: number) {
    keywords = keywords.filter((_, i) => i !== index);
  }

  function handleBlur() {
    // Add keyword on blur if there's text in the input
    if (inputValue.trim()) {
      addKeyword();
    }
  }
</script>

<div class="keyword-input-container">
  <div class="keyword-pills-wrapper" class:disabled>
    {#each keywords as keyword, index}
      <span class="keyword-pill">
        {keyword}
        <button
          type="button"
          class="remove-btn"
          onclick={() => removeKeyword(index)}
          disabled={disabled}
          aria-label="Remove keyword"
        >
          ×
        </button>
      </span>
    {/each}
    <input
      type="text"
      bind:value={inputValue}
      onkeydown={handleKeydown}
      onblur={handleBlur}
      {placeholder}
      {disabled}
      class="keyword-input"
    />
  </div>
  <p class="field-hint">Press comma or Enter to add a keyword. Keywords help with search and SEO.</p>
</div>

<style>
  .keyword-input-container {
    width: 100%;
  }

  .keyword-pills-wrapper {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border: 2px solid var(--color-fg);
    background-color: var(--color-bg);
    min-height: 44px;
    transition: border-color 100ms;
  }

  .keyword-pills-wrapper:focus-within {
    outline: none;
    border-width: 3px;
  }

  .keyword-pills-wrapper.disabled {
    background-color: var(--color-muted);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .keyword-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    background: var(--color-fg);
    color: var(--color-bg);
    font-size: 0.75rem;
    font-weight: 500;
    font-family: var(--font-mono, ui-monospace, monospace);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: 1px solid var(--color-fg);
    animation: slideIn 100ms ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--color-bg);
    color: var(--color-bg);
    width: 18px;
    height: 18px;
    cursor: pointer;
    font-size: 1.25rem;
    line-height: 1;
    padding: 0;
    transition: opacity 100ms;
  }

  .remove-btn:hover:not(:disabled) {
    opacity: 0.7;
  }

  .remove-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .keyword-input {
    flex: 1;
    min-width: 200px;
    border: none;
    outline: none;
    padding: 0.25rem;
    font-size: 1rem;
    font-family: inherit;
    background: transparent;
  }

  .keyword-input:disabled {
    cursor: not-allowed;
  }

  .keyword-input::placeholder {
    color: var(--color-fg);
    opacity: 0.5;
    font-style: italic;
  }

  .field-hint {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.6;
    font-style: italic;
  }
</style>
