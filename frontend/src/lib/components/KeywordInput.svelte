<script lang="ts">
  export let keywords: string[] = [];
  export let disabled: boolean = false;
  export let placeholder: string = "Type keywords and press comma...";

  let inputValue = '';

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
          on:click={() => removeKeyword(index)}
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
      on:keydown={handleKeydown}
      on:blur={handleBlur}
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
    border: 1px solid #ccc;
    border-radius: 4px;
    background-color: white;
    min-height: 44px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .keyword-pills-wrapper:focus-within {
    border-color: #0066cc;
    box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
  }

  .keyword-pills-wrapper.disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
  }

  .keyword-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border-radius: 16px;
    font-size: 0.875rem;
    font-weight: 500;
    animation: slideIn 0.2s ease-out;
    box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);
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
    background: rgba(255, 255, 255, 0.3);
    border: none;
    color: white;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.25rem;
    line-height: 1;
    padding: 0;
    transition: background-color 0.2s, transform 0.1s;
  }

  .remove-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.5);
    transform: scale(1.1);
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
    color: #999;
    font-style: italic;
  }

  .field-hint {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: #666;
    font-style: italic;
  }
</style>
