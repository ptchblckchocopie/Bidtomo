<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let images: Array<{ image: { url: string; alt?: string } }> = [];
  export let productTitle: string = '';
  export let autoplayInterval: number = 3000; // ms between slides

  let currentIndex = 0;
  let autoplayTimer: number | null = null;
  let isAutoplayActive = true;
  let hasUserInteracted = false;

  // Lightbox state
  let lightboxOpen = false;
  let lightboxIndex = 0;

  // Touch/swipe state
  let touchStartX = 0;
  let touchEndX = 0;
  let isSwiping = false;
  const minSwipeDistance = 50; // Minimum distance in pixels to trigger a swipe

  function nextSlide() {
    currentIndex = (currentIndex + 1) % images.length;
  }

  function prevSlide() {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
  }

  function goToSlide(index: number) {
    currentIndex = index;
    stopAutoplay();
  }

  function startAutoplay() {
    if (images.length <= 1 || hasUserInteracted) return;

    stopAutoplay();
    autoplayTimer = window.setInterval(() => {
      nextSlide();
    }, autoplayInterval);
    isAutoplayActive = true;
  }

  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
    isAutoplayActive = false;
  }

  function handleUserInteraction() {
    hasUserInteracted = true;
    stopAutoplay();
  }

  function handlePrevClick() {
    handleUserInteraction();
    prevSlide();
  }

  function handleNextClick() {
    handleUserInteraction();
    nextSlide();
  }

  // Lightbox functions
  function openLightbox(index: number) {
    lightboxIndex = index;
    lightboxOpen = true;
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  function closeLightbox() {
    lightboxOpen = false;
    document.body.style.overflow = ''; // Restore scrolling
  }

  function lightboxPrev() {
    lightboxIndex = (lightboxIndex - 1 + images.length) % images.length;
  }

  function lightboxNext() {
    lightboxIndex = (lightboxIndex + 1) % images.length;
  }

  // Keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    if (lightboxOpen) {
      // Keyboard controls for lightbox
      if (event.key === 'Escape') {
        closeLightbox();
      } else if (event.key === 'ArrowLeft') {
        lightboxPrev();
      } else if (event.key === 'ArrowRight') {
        lightboxNext();
      }
    } else {
      // Keyboard controls for slider
      if (event.key === 'ArrowLeft') {
        handleUserInteraction();
        prevSlide();
      } else if (event.key === 'ArrowRight') {
        handleUserInteraction();
        nextSlide();
      }
    }
  }

  // Touch/swipe handlers
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
        // Swiped left - go to next slide
        nextSlide();
      } else {
        // Swiped right - go to previous slide
        prevSlide();
      }
    }

    // Reset values
    touchStartX = 0;
    touchEndX = 0;
  }

  // Start autoplay on mount
  onMount(() => {
    startAutoplay();
  });

  // Clean up on destroy
  onDestroy(() => {
    stopAutoplay();
    document.body.style.overflow = ''; // Restore scrolling
  });

  // Restart autoplay when images change
  $: if (images.length > 1 && !hasUserInteracted) {
    startAutoplay();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if images && images.length > 0}
  <div class="image-slider">
    <!-- Main image display -->
    <div
      class="slider-main"
      on:touchstart={handleTouchStart}
      on:touchmove={handleTouchMove}
      on:touchend={handleTouchEnd}
    >
      <div class="slider-images">
        {#each images as imageItem, index}
          <div class="slide" class:active={index === currentIndex}>
            <img
              src={imageItem.image.url}
              alt={imageItem.image.alt || productTitle}
              loading={index === 0 ? 'eager' : 'lazy'}
              on:click={() => openLightbox(index)}
              class="clickable-image"
              role="button"
              tabindex="0"
            />
          </div>
        {/each}
      </div>

      <!-- Navigation arrows (only show if more than 1 image) -->
      {#if images.length > 1}
        <button
          class="nav-arrow nav-prev"
          on:click={handlePrevClick}
          aria-label="Previous image"
        >
          ‹
        </button>
        <button
          class="nav-arrow nav-next"
          on:click={handleNextClick}
          aria-label="Next image"
        >
          ›
        </button>

        <!-- Slide counter -->
        <div class="slide-counter">
          {currentIndex + 1} / {images.length}
        </div>
      {/if}
    </div>

    <!-- Thumbnail navigation (only show if more than 1 image) -->
    {#if images.length > 1}
      <div class="thumbnail-nav">
        {#each images as imageItem, index}
          <button
            class="thumbnail"
            class:active={index === currentIndex}
            on:click={() => goToSlide(index)}
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

<!-- Lightbox Modal -->
{#if lightboxOpen}
  <div class="lightbox-overlay" on:click={closeLightbox} role="button" tabindex="0">
    <button class="lightbox-close" on:click={closeLightbox} aria-label="Close lightbox">
      ✕
    </button>

    <div class="lightbox-content" on:click|stopPropagation role="dialog">
      <img
        src={images[lightboxIndex].image.url}
        alt={images[lightboxIndex].image.alt || productTitle}
        class="lightbox-image"
      />

      {#if images.length > 1}
        <button
          class="lightbox-arrow lightbox-prev"
          on:click={lightboxPrev}
          aria-label="Previous image"
        >
          ‹
        </button>
        <button
          class="lightbox-arrow lightbox-next"
          on:click={lightboxNext}
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
    background-color: #f5f5f5;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
    background: rgba(0, 0, 0, 0.5);
    color: white;
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
    background: rgba(220, 38, 38, 0.9);
  }

  .nav-arrow:active {
    transform: translateY(-50%) scale(0.95);
  }

  .nav-prev {
    left: 0;
    border-radius: 0 8px 8px 0;
  }

  .nav-next {
    right: 0;
    border-radius: 8px 0 0 8px;
  }

  .slide-counter {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-size: 0.9rem;
    font-weight: 600;
    z-index: 10;
  }

  .thumbnail-nav {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
    overflow-x: auto;
    padding: 0.5rem 0;
    scrollbar-width: thin;
    scrollbar-color: #dc2626 #f5f5f5;
  }

  .thumbnail-nav::-webkit-scrollbar {
    height: 8px;
  }

  .thumbnail-nav::-webkit-scrollbar-track {
    background: #f5f5f5;
    border-radius: 4px;
  }

  .thumbnail-nav::-webkit-scrollbar-thumb {
    background: #dc2626;
    border-radius: 4px;
  }

  .thumbnail-nav::-webkit-scrollbar-thumb:hover {
    background: #991b1b;
  }

  .thumbnail {
    flex-shrink: 0;
    width: 80px;
    height: 80px;
    border: 3px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s ease;
    background: #f5f5f5;
    padding: 0;
  }

  .thumbnail:hover {
    border-color: #dc2626;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(220, 38, 38, 0.3);
  }

  .thumbnail.active {
    border-color: #dc2626;
    box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.2);
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
    background-color: #f5f5f5;
    border-radius: 12px;
    color: #999;
    font-size: 1.2rem;
    font-weight: 600;
    margin-bottom: 2rem;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .slider-main {
      aspect-ratio: 1;
    }

    .nav-arrow {
      width: 40px;
      height: 40px;
      font-size: 2rem;
    }

    .slide-counter {
      font-size: 0.8rem;
      padding: 0.4rem 0.8rem;
      bottom: 0.5rem;
      right: 0.5rem;
    }

    .thumbnail {
      width: 60px;
      height: 60px;
    }

    .thumbnail-nav {
      gap: 0.5rem;
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
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .lightbox-close {
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.3);
    font-size: 2.5rem;
    width: 60px;
    height: 60px;
    border-radius: 50%;
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
    background: rgba(220, 38, 38, 0.9);
    border-color: rgba(220, 38, 38, 1);
    transform: rotate(90deg);
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
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .lightbox-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.3);
    font-size: 4rem;
    width: 70px;
    height: 70px;
    border-radius: 50%;
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
    background: rgba(220, 38, 38, 0.9);
    border-color: rgba(220, 38, 38, 1);
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
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 30px;
    font-size: 1.1rem;
    font-weight: 600;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }

  /* Mobile lightbox styles */
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

    .lightbox-prev {
      left: 10px;
    }

    .lightbox-next {
      right: 10px;
    }

    .lightbox-counter {
      bottom: -50px;
      font-size: 0.9rem;
      padding: 0.5rem 1rem;
    }
  }
</style>
