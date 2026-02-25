<script lang="ts">
  let {
    images = [],
    productTitle = '',
    autoplayInterval = 3000
  }: {
    images?: Array<{ image: { url: string; alt?: string } }>;
    productTitle?: string;
    autoplayInterval?: number;
  } = $props();

  let currentIndex = $state(0);
  let isAutoplayActive = $state(true);
  let hasUserInteracted = $state(false);

  // Lightbox state
  let lightboxOpen = $state(false);
  let lightboxIndex = $state(0);

  // Touch/swipe state
  let touchStartX = $state(0);
  let touchEndX = $state(0);
  let isSwiping = $state(false);
  const minSwipeDistance = 50;

  function nextSlide() {
    currentIndex = (currentIndex + 1) % images.length;
  }

  function prevSlide() {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
  }

  function goToSlide(index: number) {
    currentIndex = index;
    handleUserInteraction();
  }

  function handleUserInteraction() {
    hasUserInteracted = true;
    isAutoplayActive = false;
  }

  function handlePrevClick() {
    handleUserInteraction();
    prevSlide();
  }

  function handleNextClick() {
    handleUserInteraction();
    nextSlide();
  }

  $effect(() => {
    if (images.length <= 1 || hasUserInteracted) {
      isAutoplayActive = false;
      return;
    }

    isAutoplayActive = true;
    const timer = window.setInterval(() => {
      nextSlide();
    }, autoplayInterval);

    return () => {
      clearInterval(timer);
    };
  });

  $effect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  });

  function openLightbox(index: number) {
    lightboxIndex = index;
    lightboxOpen = true;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightboxOpen = false;
    document.body.style.overflow = '';
  }

  function lightboxPrev() {
    lightboxIndex = (lightboxIndex - 1 + images.length) % images.length;
  }

  function lightboxNext() {
    lightboxIndex = (lightboxIndex + 1) % images.length;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (lightboxOpen) {
      if (event.key === 'Escape') {
        closeLightbox();
      } else if (event.key === 'ArrowLeft') {
        lightboxPrev();
      } else if (event.key === 'ArrowRight') {
        lightboxNext();
      }
    } else {
      if (event.key === 'ArrowLeft') {
        handleUserInteraction();
        prevSlide();
      } else if (event.key === 'ArrowRight') {
        handleUserInteraction();
        nextSlide();
      }
    }
  }

  function handleTouchStart(event: TouchEvent) {
    touchStartX = event.touches[0].clientX;
    isSwiping = true;
  }

  function handleTouchMove(event: TouchEvent) {
    if (!isSwiping) return;
    touchEndX = event.touches[0].clientX;
  }

  function handleTouchEnd() {
    if (!isSwiping) return;
    isSwiping = false;

    const swipeDistance = touchStartX - touchEndX;
    const absDistance = Math.abs(swipeDistance);

    if (absDistance > minSwipeDistance) {
      handleUserInteraction();
      if (swipeDistance > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }

    touchStartX = 0;
    touchEndX = 0;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if images && images.length > 0}
  <div class="image-slider">
    <div
      class="slider-main"
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
    >
      <div class="slider-images">
        {#each images as imageItem, index}
          <div class="slide" class:active={index === currentIndex}>
            <img
              src={imageItem.image.url}
              alt={imageItem.image.alt || productTitle}
              loading={index === 0 ? 'eager' : 'lazy'}
              onclick={() => openLightbox(index)}
              class="clickable-image"
              role="button"
              tabindex="0"
            />
          </div>
        {/each}
      </div>

      {#if images.length > 1}
        <button
          class="nav-arrow nav-prev"
          onclick={handlePrevClick}
          aria-label="Previous image"
        >
          ‹
        </button>
        <button
          class="nav-arrow nav-next"
          onclick={handleNextClick}
          aria-label="Next image"
        >
          ›
        </button>

        <div class="slide-counter">
          {currentIndex + 1} / {images.length}
        </div>
      {/if}
    </div>

    {#if images.length > 1}
      <div class="thumbnail-nav">
        {#each images as imageItem, index}
          <button
            class="thumbnail"
            class:active={index === currentIndex}
            onclick={() => goToSlide(index)}
            aria-label={`Go to image ${index + 1}`}
          >
            <img
              src={imageItem.image.url}
              alt={imageItem.image.alt || productTitle}
              loading="lazy"
            />
          </button>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div class="placeholder-image">
    <span>No Image Available</span>
  </div>
{/if}

{#if lightboxOpen}
  <div class="lightbox-overlay" onclick={closeLightbox} role="button" tabindex="0">
    <button class="lightbox-close" onclick={closeLightbox} aria-label="Close lightbox">
      ✕
    </button>

    <div class="lightbox-content" onclick={(e) => { e.stopPropagation(); }} role="dialog">
      <img
        src={images[lightboxIndex].image.url}
        alt={images[lightboxIndex].image.alt || productTitle}
        class="lightbox-image"
      />

      {#if images.length > 1}
        <button
          class="lightbox-arrow lightbox-prev"
          onclick={lightboxPrev}
          aria-label="Previous image"
        >
          ‹
        </button>
        <button
          class="lightbox-arrow lightbox-next"
          onclick={lightboxNext}
          aria-label="Next image"
        >
          ›
        </button>

        <div class="lightbox-counter">
          {lightboxIndex + 1} / {images.length}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .image-slider {
    width: 100%;
    margin-bottom: 2rem;
  }

  .slider-main {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background-color: var(--color-muted);
    overflow: hidden;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    touch-action: pan-y pinch-zoom;
    user-select: none;
    -webkit-user-select: none;
  }

  .slider-images {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .slide {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.5s ease, visibility 0.5s ease;
  }

  .slide.active {
    opacity: 1;
    visibility: visible;
  }

  .slide img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .clickable-image {
    cursor: pointer;
    transition: opacity 0.2s ease;
  }

  .clickable-image:hover {
    opacity: 0.95;
  }

  .nav-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: var(--color-fg);
    color: var(--color-white);
    border: none;
    font-size: 3rem;
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.3s ease;
    z-index: 10;
    line-height: 1;
    padding: 0;
  }

  .nav-arrow:hover {
    background: var(--color-red);
  }

  .nav-arrow:active {
    transform: translateY(-50%) scale(0.95);
  }

  .nav-prev {
    left: 0;
  }

  .nav-next {
    right: 0;
  }

  .slide-counter {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    background: var(--color-fg);
    color: var(--color-white);
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    font-weight: 700;
    z-index: 10;
    border: 2px solid var(--color-border);
  }

  .thumbnail-nav {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
    overflow-x: auto;
    padding: 0.5rem 0;
    scrollbar-width: thin;
    scrollbar-color: var(--color-red) var(--color-muted);
  }

  .thumbnail-nav::-webkit-scrollbar {
    height: 8px;
  }

  .thumbnail-nav::-webkit-scrollbar-track {
    background: var(--color-muted);
  }

  .thumbnail-nav::-webkit-scrollbar-thumb {
    background: var(--color-red);
  }

  .thumbnail-nav::-webkit-scrollbar-thumb:hover {
    background: var(--color-fg);
  }

  .thumbnail {
    flex-shrink: 0;
    width: 80px;
    height: 80px;
    border: var(--border-bh) solid transparent;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s ease;
    background: var(--color-muted);
    padding: 0;
  }

  .thumbnail:hover {
    border-color: var(--color-red);
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-sm);
  }

  .thumbnail.active {
    border-color: var(--color-border);
    box-shadow: var(--shadow-bh-sm);
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .placeholder-image {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 4 / 3;
    background-color: var(--color-muted);
    color: var(--color-fg);
    opacity: 0.6;
    font-size: 1.2rem;
    font-weight: 600;
    margin-bottom: 2rem;
    border: var(--border-bh) solid var(--color-border);
  }

  @media (max-width: 768px) {
    .image-slider {
      margin-bottom: 1rem;
    }

    .slider-main {
      aspect-ratio: 4 / 3;
      border-width: 2px;
      box-shadow: 2px 2px 0px var(--color-border);
    }

    .slide img {
      object-fit: cover;
    }

    .nav-arrow {
      width: 36px;
      height: 36px;
      font-size: 1.8rem;
    }

    .slide-counter {
      font-size: 0.75rem;
      padding: 0.3rem 0.6rem;
      bottom: 0.5rem;
      right: 0.5rem;
    }

    .thumbnail {
      width: 50px;
      height: 50px;
    }

    .thumbnail-nav {
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
  }

  /* Lightbox Styles */
  .lightbox-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.95);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;
    cursor: zoom-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .lightbox-close {
    position: absolute;
    top: 20px;
    right: 20px;
    background: var(--color-fg);
    color: var(--color-white);
    border: var(--border-bh) solid var(--color-white);
    font-size: 2.5rem;
    width: 60px;
    height: 60px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    z-index: 10001;
    line-height: 1;
    padding: 0;
  }

  .lightbox-close:hover {
    background: var(--color-red);
    border-color: var(--color-red);
  }

  .lightbox-content {
    position: relative;
    max-width: 95vw;
    max-height: 95vh;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
  }

  .lightbox-image {
    max-width: 100%;
    max-height: 95vh;
    width: auto;
    height: auto;
    object-fit: contain;
    border: var(--border-bh) solid var(--color-white);
    box-shadow: var(--shadow-bh-md);
  }

  .lightbox-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: var(--color-fg);
    color: var(--color-white);
    border: var(--border-bh) solid var(--color-white);
    font-size: 4rem;
    width: 70px;
    height: 70px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s ease;
    z-index: 10000;
    line-height: 1;
    padding: 0;
  }

  .lightbox-arrow:hover {
    background: var(--color-red);
    border-color: var(--color-red);
    transform: translateY(-50%) scale(1.1);
  }

  .lightbox-prev {
    left: 40px;
  }

  .lightbox-next {
    right: 40px;
  }

  .lightbox-counter {
    position: absolute;
    bottom: -60px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-fg);
    color: var(--color-white);
    padding: 0.75rem 1.5rem;
    font-size: 1.1rem;
    font-weight: 700;
    border: 2px solid var(--color-white);
  }

  @media (max-width: 768px) {
    .lightbox-close {
      top: 10px;
      right: 10px;
      width: 50px;
      height: 50px;
      font-size: 2rem;
    }

    .lightbox-arrow {
      width: 50px;
      height: 50px;
      font-size: 2.5rem;
    }

    .lightbox-prev { left: 10px; }
    .lightbox-next { right: 10px; }

    .lightbox-counter {
      bottom: -50px;
      font-size: 0.9rem;
      padding: 0.5rem 1rem;
    }
  }
</style>
