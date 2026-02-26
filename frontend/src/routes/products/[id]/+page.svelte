<script lang="ts">
  import { placeBid, fetchProductBids, updateProduct, checkProductStatus, fetchProduct, fetchUserRatings, calculateUserRatingStats, fetchUserProducts, type UserRatingStats } from '$lib/api';
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { PageData } from './$types';
  import ProductForm from '$lib/components/ProductForm.svelte';
  import ImageSlider from '$lib/components/ImageSlider.svelte';
  import StarRating from '$lib/components/StarRating.svelte';
  import type { Product } from '$lib/api';
  import { getProductSSE, disconnectProductSSE, queueBid as queueBidToRedis, type SSEEvent, type BidEvent, type ProductVisibilityEvent } from '$lib/sse';
  import { onMount, onDestroy } from 'svelte';

  let { data } = $props<{ data: PageData }>();

  // Dynamic back link based on 'from' parameter
  let backLink = $derived.by(() => {
    const from = $page.url.searchParams.get('from');
    switch (from) {
      case 'inbox':
        // When going back to inbox, include the product parameter so the conversation is selected
        return `/inbox?product=${data.product?.id || ''}`;
      case 'browse':
        return '/products';
      default:
        return '/products';
    }
  });

  let backLinkText = $derived.by(() => {
    const from = $page.url.searchParams.get('from');
    switch (from) {
      case 'inbox':
        return 'Back to Inbox';
      case 'browse':
        return 'Back to Products';
      default:
        return 'Back to Products';
    }
  });

  // Admin hide/unhide modal
  let adminModalOpen = $state(false);
  let adminModalLoading = $state(false);

  function openAdminModal() {
    adminModalOpen = true;
  }

  function closeAdminModal() {
    adminModalOpen = false;
    adminModalLoading = false;
  }

  async function confirmToggleVisibility() {
    adminModalLoading = true;
    try {
      const result = await updateProduct(String(data.product.id), { active: !data.product.active });
      if (result) data.product.active = !data.product.active;
    } finally {
      closeAdminModal();
    }
  }

  let bidAmount = $state(0);

  let bidInterval = $derived(data.product?.bidInterval || 1);
  let minBid = $derived((data.product?.currentBid || data.product?.startingPrice || 0) + bidInterval);

  // Update bidAmount when minBid changes
  $effect(() => {
    if (minBid && bidAmount === 0) {
      bidAmount = minBid;
    }
  });
  let bidding = $state(false);
  let bidError = $state('');
  let bidSuccess = $state(false);
  let showLoginModal = $state(false);
  let showConfirmBidModal = $state(false);
  let showEditModal = $state(false);
  let showAcceptBidModal = $state(false);
  let bidSectionOpen = $state(false);
  let censorMyName = $state(true);
  // Save censor name preference to localStorage when it changes
  $effect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bid_censor_name', String(censorMyName));
    }
  });
  let accepting = $state(false);
  let acceptError = $state('');
  let acceptSuccess = $state(false);

  // Seller rating data
  let sellerRatingStats: UserRatingStats | null = $state(null);
  let sellerCompletedSales = $state(0);
  let loadingSellerData = $state(true);

  // Sort bids by amount (highest to lowest)
  let sortedBids = $derived([...data.bids].sort((a, b) => b.amount - a.amount));

  // Calculate percentage increase from starting price
  let percentageIncrease = $derived(data.product?.currentBid && data.product?.startingPrice
    ? ((data.product.currentBid - data.product.startingPrice) / data.product.startingPrice * 100).toFixed(1)
    : '0.0');

  // Countdown timer
  let timeRemaining = $state('');
  let countdownInterval: ReturnType<typeof setInterval> | null = $state(null);

  // Check if auction has ended by time (not just status)
  let hasAuctionEnded = $derived(data.product?.auctionEndDate
    ? new Date().getTime() > new Date(data.product.auctionEndDate).getTime()
    : false);

  // Real-time update with polling
  let pollingInterval: ReturnType<typeof setInterval> | null = $state(null);
  let lastKnownState = $state({
    updatedAt: data.product?.updatedAt || '',
    latestBidTime: '',
    bidCount: data.bids.length,
    status: data.product?.status || 'active',
    currentBid: data.product?.currentBid
  });
  let isUpdating = $state(false);
  let connectionStatus: 'connected' | 'disconnected' = $state('connected');

  // Animation tracking
  let previousBids: any[] = $state([...data.bids]);
  let newBidIds = $state(new Set<string>());
  let priceChanged = $state(false);
  let showConfetti = $state(false);
  let animatingBidId: string | null = $state(null);

  // Outbid tracking
  let wasOutbid = $state(false);
  let wasHighestBidder = $state(false);
  let outbidAnimating = $state(false);
  let currentBidderMessage = $state('');

  // Random messages for highest bidder
  const highestBidderMessages = [
    "You're currently the highest bidder! 🎯",
    "Leading the pack! Keep your eyes on the prize! 👀",
    "You're in the lead! Stay sharp! ⚡",
    "Top bidder alert! You're winning! 🏆",
    "You're ahead of the competition! 🚀",
    "Currently in first place! Nice move! 💪",
    "You've taken the lead! Hold on tight! 🎢",
    "Winning bid is yours... for now! 😎",
    "You're the one to beat! 🥇",
    "Sitting at the top! Great bid! ⭐",
    "You're dominating this auction! 🔥",
    "Front runner status achieved! 🏃‍♂️"
  ];

  // Random messages for when user gets outbid
  const outbidMessages = [
    "Oh no! Someone just outbid you! 😱",
    "Uh oh! You've been outbid! Time to strike back! ⚔️",
    "Plot twist! Another bidder took the lead! 😮",
    "You've been dethroned! Will you reclaim your spot? 👑",
    "Someone swooped in! Don't let them win! 🦅",
    "Outbid alert! The competition is heating up! 🔥",
    "They snatched the lead! Fight back! 💥",
    "You lost the top spot! Bid again to reclaim it! 🎯",
    "A challenger appeared and took the lead! ⚡",
    "Oops! Someone wants this more than you... or do they? 🤔",
    "The tables have turned! Your move! ♟️",
    "Knocked off the throne! Time for revenge? 😤"
  ];

  // Get random message
  function getRandomMessage(messages: string[]): string {
    return messages[Math.floor(Math.random() * messages.length)];
  }

  // Check if current user is the seller
  let isOwner = $derived($authStore.user?.id && data.product?.seller?.id &&
               $authStore.user.id === data.product.seller.id);

  // Get highest bid
  let highestBid = $derived(sortedBids.length > 0 ? sortedBids[0] : null);

  // Check if current user is the highest bidder
  let isHighestBidder = $derived($authStore.user?.id && highestBid &&
                       (typeof highestBid.bidder === 'object' ? highestBid.bidder.id : highestBid.bidder) === $authStore.user.id);

  // Update bidder message when status changes
  $effect(() => {
    const currentUserId = $authStore.user?.id;
    const currentHighestBidderId = highestBid ?
      (typeof highestBid.bidder === 'object' ? highestBid.bidder.id : highestBid.bidder) : null;

    const isCurrentlyHighest = currentUserId && currentHighestBidderId === currentUserId;

    // Check if user was outbid (but NOT if they just placed a successful bid themselves)
    if (wasHighestBidder && !isCurrentlyHighest && currentUserId && !bidSuccess && !bidding) {
      wasOutbid = true;
      outbidAnimating = true;
      currentBidderMessage = getRandomMessage(outbidMessages);
      // Reset animation after it plays
      setTimeout(() => {
        outbidAnimating = false;
      }, 500);
      // Auto-close the outbid alert after 5 seconds
      setTimeout(() => {
        wasOutbid = false;
      }, 5000);
    } else if (isCurrentlyHighest && !wasHighestBidder) {
      // User just became highest bidder
      wasOutbid = false;
      currentBidderMessage = getRandomMessage(highestBidderMessages);
    } else if (isCurrentlyHighest && wasHighestBidder && bidSuccess) {
      // User outbid themselves - still highest bidder, update message
      wasOutbid = false;
      currentBidderMessage = getRandomMessage(highestBidderMessages);
    } else if (isCurrentlyHighest && !currentBidderMessage) {
      // Initial load as highest bidder
      currentBidderMessage = getRandomMessage(highestBidderMessages);
    }

    wasHighestBidder = !!isCurrentlyHighest;
  });

  // Prepare chart data - bids sorted by time (oldest first), with x/y coordinates
  let chartData = $derived.by(() => {
    const points = [...data.bids]
      .sort((a, b) => new Date(a.bidTime).getTime() - new Date(b.bidTime).getTime())
      .map((bid, index) => ({
        time: new Date(bid.bidTime),
        price: bid.amount,
        index,
        x: 0,
        y: 0
      }));

    if (points.length > 0) {
      const minPrice = data.product?.startingPrice || Math.min(...points.map(d => d.price));
      const maxPrice = Math.max(...points.map(d => d.price));
      const priceRange = maxPrice - minPrice || 1;

      points.forEach((d) => {
        d.x = (d.index / Math.max(points.length - 1, 1)) * 100;
        d.y = 100 - ((d.price - minPrice) / priceRange) * 100;
      });
    }

    return points;
  });

  // Get the seller's currency for this product
  let sellerCurrency = $derived(data.product?.seller?.currency || 'PHP');

  async function updateCountdown() {
    if (!data.product?.auctionEndDate) return;

    const now = new Date().getTime();
    const end = new Date(data.product.auctionEndDate).getTime();
    const distance = end - now;

    if (distance < 0) {
      timeRemaining = 'Auction Ended';
      if (countdownInterval) clearInterval(countdownInterval);

      // Auto-close auction if it's still active and time has ended
      if ((data.product.status === 'active' || data.product.status === 'available') && isOwner && highestBid) {
        // Automatically mark as sold if there's a winning bid
        try {
          await updateProduct(data.product.id, { status: 'sold' });
          window.location.reload();
        } catch (error) {
          console.error('Error auto-closing auction:', error);
        }
      } else if ((data.product.status === 'active' || data.product.status === 'available') && isOwner && !highestBid) {
        // Mark as ended if no bids
        try {
          await updateProduct(data.product.id, { status: 'ended' });
          window.location.reload();
        } catch (error) {
          console.error('Error auto-closing auction:', error);
        }
      }

      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    if (days > 0) {
      timeRemaining = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      timeRemaining = `${hours}h ${minutes}m ${seconds}s`;
    } else {
      timeRemaining = `${minutes}m ${seconds}s`;
    }
  }

  $effect(() => {
    if (data.product?.auctionEndDate) {
      updateCountdown();
      if (!countdownInterval) {
        countdownInterval = setInterval(updateCountdown, 1000);
      }
    }
  });

  // Function to check for updates and refresh data if needed
  async function checkForUpdates() {
    if (!data.product || isUpdating) return;

    try {
      const status = await checkProductStatus(data.product.id);

      if (!status) return;

      // Check if anything changed
      const hasProductUpdate = status.updatedAt !== lastKnownState.updatedAt;
      const hasBidUpdate = status.latestBidTime !== lastKnownState.latestBidTime;
      const hasBidCountUpdate = status.bidCount !== lastKnownState.bidCount;
      const hasStatusUpdate = status.status !== lastKnownState.status;
      const hasPriceUpdate = status.currentBid !== lastKnownState.currentBid;

      if (hasProductUpdate || hasBidUpdate || hasBidCountUpdate || hasStatusUpdate || hasPriceUpdate) {
        isUpdating = true;

        // Fetch updated product data
        if (hasProductUpdate || hasStatusUpdate || hasPriceUpdate) {
          const updatedProduct = await fetchProduct(data.product.id);
          if (updatedProduct) {
            data.product = updatedProduct;
          }
        }

        // Fetch updated bids and detect changes
        if (hasBidUpdate || hasBidCountUpdate) {
          const updatedBids = await fetchProductBids(data.product.id);

          // Identify new bids for animation
          const previousBidIds = new Set(previousBids.map(b => b.id));
          newBidIds = new Set(
            updatedBids
              .filter(b => !previousBidIds.has(b.id))
              .map(b => b.id)
          );

          // Store previous bids
          previousBids = [...updatedBids];

          data.bids = updatedBids;

          // Trigger animations for new bids
          if (newBidIds.size > 0) {
            setTimeout(() => {
              newBidIds = new Set();
            }, 3000);
          }
        }

        // Detect price change and trigger confetti
        if (hasPriceUpdate) {
          priceChanged = true;
          showConfetti = true;

          setTimeout(() => {
            priceChanged = false;
          }, 1000);

          setTimeout(() => {
            showConfetti = false;
          }, 3000);
        }

        // Update last known state
        lastKnownState = {
          updatedAt: status.updatedAt,
          latestBidTime: status.latestBidTime || '',
          bidCount: status.bidCount,
          status: status.status,
          currentBid: status.currentBid
        };

        // Save to localStorage
        if (data.product) {
          localStorage.setItem(`product_${data.product.id}_state`, JSON.stringify(lastKnownState));
        }

        // Trigger reactivity
        data = { ...data };

        isUpdating = false;
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      isUpdating = false;
    }
  }

  // Force immediate update check (useful after placing a bid)
  async function forceUpdateCheck() {
    await checkForUpdates();
  }

  // Load seller rating data
  async function loadSellerData(sellerId: string) {
    try {
      loadingSellerData = true;

      // Fetch ratings received by seller
      const ratings = await fetchUserRatings(sellerId, 'received');
      sellerRatingStats = calculateUserRatingStats(ratings);

      // Fetch completed sales count
      const soldProducts = await fetchUserProducts(sellerId, { status: 'sold' });
      sellerCompletedSales = soldProducts.totalDocs;
    } catch (error) {
      console.error('Error loading seller data:', error);
    } finally {
      loadingSellerData = false;
    }
  }

  onMount(() => {
    // Load last known state from localStorage if available
    const savedState = localStorage.getItem(`product_${data.product?.id}_state`);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        lastKnownState = parsed;
      } catch (e) {
        console.error('Error parsing saved state:', e);
      }
    }

    // Load censor name preference from localStorage
    const savedCensorPref = localStorage.getItem('bid_censor_name');
    if (savedCensorPref !== null) {
      censorMyName = savedCensorPref === 'true';
    }

    // Fetch seller rating data
    if (data.product?.seller?.id) {
      loadSellerData(data.product.seller.id);
    }

    // Connect to SSE for real-time updates
    if (data.product?.id) {
      const sseClient = getProductSSE(String(data.product.id));
      sseClient.connect();

      // Subscribe to bid events
      const unsubscribe = sseClient.subscribe(async (event: SSEEvent) => {
        if (event.type === 'bid' && (event as BidEvent).success) {
          const bidEvent = event as BidEvent;

          // Update product current bid
          if (data.product && bidEvent.amount) {
            const newAmount = bidEvent.amount;
            const previousBid = data.product.currentBid || data.product.startingPrice;

            // Check if this confirms one of our optimistic bids
            const isOwnOptimisticConfirmation = bidEvent.bidderId && data.bids.some((b: any) =>
              String(b.id).startsWith('optimistic-') && b.amount === newAmount &&
              String(bidEvent.bidderId) === String(b.bidder?.id)
            );

            if (newAmount > previousBid || isOwnOptimisticConfirmation) {

              if (!isOwnOptimisticConfirmation) {
                priceChanged = true;
              }
              data.product.currentBid = newAmount;

              // Create new bid object from SSE data (no need to fetch!)
              if (bidEvent.bidId && bidEvent.bidderId) {
                const newBid = {
                  id: String(bidEvent.bidId),
                  amount: bidEvent.amount,
                  bidTime: bidEvent.bidTime || new Date().toISOString(),
                  censorName: bidEvent.censorName || false,
                  bidder: {
                    id: String(bidEvent.bidderId),
                    name: bidEvent.bidderName || 'Anonymous',
                    email: '',
                  },
                  product: data.product.id,
                };

                // Remove any optimistic bid with the same amount from the same user
                const filteredBids = data.bids.filter((b: any) => {
                  if (!String(b.id).startsWith('optimistic-')) return true;
                  // Remove optimistic bid if this real bid matches (same user + same amount)
                  return !(String(bidEvent.bidderId) === String(b.bidder?.id) && bidEvent.amount === b.amount);
                });

                // Only add if not already present (by real id)
                if (!filteredBids.some((b: any) => b.id === String(bidEvent.bidId))) {
                  newBidIds = new Set([String(bidEvent.bidId)]);
                  data.bids = [newBid as any, ...filteredBids];
                } else {
                  data.bids = filteredBids;
                }
              }

              // Update bid amount if it's below the new minimum
              // (minBid is $derived and will auto-update, but we need to adjust bidAmount)
              const newMinBid = (data.product.currentBid || data.product.startingPrice || 0) + bidInterval;
              if (bidAmount < newMinBid) {
                bidAmount = newMinBid;
              }

              // Clear animations after delay
              setTimeout(() => {
                priceChanged = false;
                newBidIds = new Set();
              }, 3000);

              // Trigger reactivity
              data = { ...data };
            }
          }
        } else if (event.type === 'accepted') {
          // Smoothly update UI when bid is accepted
          if (data.product && event.success) {
            data.product.status = 'sold';

            // Close accept bid modal if open
            showAcceptBidModal = false;
            acceptSuccess = true;

            // Trigger reactivity
            data = { ...data };

            // Show success feedback without refresh
            setTimeout(() => {
              acceptSuccess = false;
            }, 3000);
          }
        } else if (event.type === 'product_visibility') {
          const visEvent = event as ProductVisibilityEvent;
          if (data.product) {
            data.product.active = visEvent.active;
            data = { ...data };
          }
        }
      });

      // Store unsubscribe for cleanup
      (window as any).__sseUnsubscribe = unsubscribe;
    }

    // Fallback polling every 10 seconds (reduced frequency since we have SSE)
    pollingInterval = setInterval(() => {
      checkForUpdates();
    }, 10000);

    // Initial check
    checkForUpdates();

    // Handle visibility change - stop polling when tab is not visible
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden, stop all intervals to save resources
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
      } else {
        // Tab is visible again, restart intervals
        if (!pollingInterval) {
          checkForUpdates(); // Immediate update when returning
          pollingInterval = setInterval(() => {
            checkForUpdates();
          }, 10000); // Use same 10 second interval as initial
        }
        if (!countdownInterval && data.product?.auctionEndDate) {
          updateCountdown(); // Immediate update
          countdownInterval = setInterval(updateCountdown, 1000);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup visibility listener on destroy
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  onDestroy(() => {
    if (countdownInterval) clearInterval(countdownInterval);
    if (pollingInterval) clearInterval(pollingInterval);

    // Disconnect from SSE
    if (data.product?.id) {
      disconnectProductSSE(String(data.product.id));
    }
    if ((window as any).__sseUnsubscribe) {
      (window as any).__sseUnsubscribe();
    }
  });

  function formatPrice(price: number, currency: string = 'PHP'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(price);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function incrementBid() {
    bidAmount = bidAmount + bidInterval;
  }

  function decrementBid() {
    const newAmount = bidAmount - bidInterval;
    if (newAmount >= minBid) {
      bidAmount = newAmount;
    }
  }

  function validateBidAmount() {
    if (!bidAmount || bidAmount < minBid) {
      bidAmount = minBid;
      bidError = `Bid amount adjusted to minimum: ${formatPrice(minBid, sellerCurrency)}`;
      setTimeout(() => bidError = '', 3000);
      return;
    }

    // Check if bid is divisible by interval
    const currentHighest = data.product?.currentBid || data.product?.startingPrice || 0;
    const difference = bidAmount - currentHighest;

    if (difference % bidInterval !== 0) {
      // Round up to the nearest valid increment
      const remainder = difference % bidInterval;
      const adjustment = bidInterval - remainder;
      bidAmount = bidAmount + adjustment;
      bidError = `Bid amount must be in increments of ${formatPrice(bidInterval, sellerCurrency)}. Adjusted to ${formatPrice(bidAmount, sellerCurrency)}`;
      setTimeout(() => bidError = '', 3000);
    }
  }

  function handlePlaceBid() {
    if (!data.product) return;

    // Check if user is logged in
    if (!$authStore.isAuthenticated) {
      showLoginModal = true;
      return;
    }

    // Validate bid amount
    const currentHighest = data.product.currentBid || data.product.startingPrice;
    const minimumBid = currentHighest + bidInterval;

    if (bidAmount < minimumBid) {
      bidError = `Your bid must be at least ${formatPrice(minimumBid, sellerCurrency)} (current highest: ${formatPrice(currentHighest, sellerCurrency)})`;
      return;
    }

    // Show confirmation modal
    bidError = '';
    showConfirmBidModal = true;
  }

  async function confirmPlaceBid() {
    if (!data.product) return;

    showConfirmBidModal = false;
    bidding = true;
    bidError = '';
    bidSuccess = false;

    const submittedAmount = bidAmount;
    const currentUser = $authStore.user;

    // Save state before optimistic update so we can restore on failure
    const previousCurrentBid = data.product.currentBid;
    const previousBids = [...data.bids];
    const previousBidAmount = bidAmount;

    // Optimistic update: show the bid immediately in the UI
    const optimisticBidId = `optimistic-${Date.now()}`;
    let optimisticBid: any = null;
    if (currentUser) {
      optimisticBid = {
        id: optimisticBidId,
        amount: submittedAmount,
        bidTime: new Date().toISOString(),
        censorName: censorMyName,
        bidder: {
          id: String(currentUser.id),
          name: currentUser.name || currentUser.email || 'You',
          email: currentUser.email || '',
        },
        product: data.product.id,
      };

      // Update UI immediately
      data.product.currentBid = submittedAmount;
      newBidIds = new Set([optimisticBidId]);
      data.bids = [optimisticBid, ...data.bids];
      priceChanged = true;
      showConfetti = true;
      bidSuccess = true;

      // Advance bid amount to next minimum
      bidAmount = submittedAmount + bidInterval;

      // Trigger reactivity
      data = { ...data };
    }

    try {
      // Fire the actual request
      const queueResult = await queueBidToRedis(data.product.id, submittedAmount, censorMyName);

      if (queueResult.success) {
        bidError = '';

        // If bid was processed directly (fallback), replace optimistic bid with real data
        if (queueResult.fallback || queueResult.bidId) {
          const updatedBids = await fetchProductBids(data.product.id);
          const previousBidIdSet = new Set(data.bids.filter((b: any) => b.id !== optimisticBidId).map((b: any) => b.id));
          newBidIds = new Set(
            updatedBids
              .filter((b: any) => !previousBidIdSet.has(b.id))
              .map((b: any) => b.id)
          );
          data.bids = updatedBids;
          if (data.product) {
            data.product.currentBid = submittedAmount;
          }
        }
        // else: bid was queued — SSE will deliver the real bid and the
        // onmessage handler will replace/supplement the optimistic entry

        // Clear animations after delay
        setTimeout(() => {
          priceChanged = false;
        }, 1000);

        setTimeout(() => {
          showConfetti = false;
        }, 3000);

        setTimeout(() => {
          newBidIds = new Set();
        }, 3000);

        // Auto-close success message after 5 seconds
        setTimeout(() => {
          bidSuccess = false;
        }, 5000);
      } else {
        // Bid failed — roll back to saved state
        if (optimisticBid && data.product) {
          data.bids = previousBids;
          data.product.currentBid = previousCurrentBid;
          priceChanged = false;
          showConfetti = false;
          bidSuccess = false;
          bidAmount = previousBidAmount;
          data = { ...data };
        }
        bidError = queueResult.error || 'Failed to place bid. Please try again.';
      }
    } catch (error) {
      console.error('Error in confirmPlaceBid:', error);
      // Roll back to saved state
      if (optimisticBid && data.product) {
        data.bids = previousBids;
        data.product.currentBid = previousCurrentBid;
        priceChanged = false;
        showConfetti = false;
        bidSuccess = false;
        bidAmount = previousBidAmount;
        data = { ...data };
      }
      bidError = 'An error occurred while placing your bid.';
    } finally {
      bidding = false;
    }
  }

  function cancelBid() {
    showConfirmBidModal = false;
  }

  function closeSuccessAlert() {
    bidSuccess = false;
  }

  // Function to censor a name (show first letter + asterisks)
  function censorName(name: string): string {
    return name
      .split(' ')
      .map(word => {
        if (word.length === 0) return '';
        const firstLetter = word.charAt(0).toUpperCase();
        const asterisks = '*'.repeat(word.length - 1);
        return firstLetter + asterisks;
      })
      .join(' ');
  }

  // Get display name for a bidder
  function getBidderName(bid: any): string {
    const bidderName = typeof bid.bidder === 'object' ? bid.bidder.name : 'Anonymous';
    return bid.censorName ? censorName(bidderName) : bidderName;
  }

  function closeModal() {
    showLoginModal = false;
  }

  function openEditModal() {
    if (!data.product) return;
    showEditModal = true;
  }

  function closeEditModal() {
    showEditModal = false;
  }

  function handleEditSuccess(updatedProduct: Product) {
    // Update the product data directly without page reload
    if (data.product) {
      data.product = {
        ...updatedProduct,
        // Preserve seller info
        seller: data.product.seller
      };

      // minBid is $derived and will auto-update; adjust bidAmount if needed
      const newMinBid = (data.product.currentBid || data.product.startingPrice || 0) + bidInterval;
      if (bidAmount < newMinBid) {
        bidAmount = newMinBid;
      }
    }

    setTimeout(() => {
      closeEditModal();
    }, 1500);
  }

  function openAcceptBidModal() {
    showAcceptBidModal = true;
    acceptError = '';
    acceptSuccess = false;
  }

  function closeAcceptBidModal() {
    showAcceptBidModal = false;
  }

  async function confirmAcceptBid() {
    if (!data.product || !highestBid) return;

    accepting = true;
    acceptError = '';
    acceptSuccess = false;

    try {
      // Queue accept bid through Redis to prevent race conditions
      const token = localStorage.getItem('auth_token');
      if (!token) {
        acceptError = 'You must be logged in to accept a bid.';
        accepting = false;
        return;
      }

      const response = await fetch('/api/bridge/bid/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `JWT ${token}`
        },
        body: JSON.stringify({
          productId: data.product.id
        })
      });

      const result = await response.json();

      if (result.success) {
        // SSE will handle the UI update smoothly when the accept is processed
        // Close the modal - SSE event will update the status
        showAcceptBidModal = false;
        // acceptSuccess will be set by SSE event when processed
      } else {
        console.error('Failed to accept bid:', result.error);
        acceptError = result.error || 'Failed to accept bid. Please try again.';
      }
    } catch (error) {
      console.error('Error accepting bid:', error);
      acceptError = 'An error occurred while accepting the bid: ' + (error instanceof Error ? error.message : String(error));
    } finally {
      accepting = false;
    }
  }

</script>

<svelte:head>
  <title>{data.product?.title || 'Product'} - BidMo.to</title>

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content={`https://bidmo.to/products/${data.product?.id || ''}`} />
  <meta property="og:title" content={data.product?.title || 'Product'} />
  <meta property="og:description" content={data.product?.description || 'Check out this product on BidMo.to'} />
  {#if data.product?.images && data.product.images.length > 0 && data.product.images[0].image}
    <meta property="og:image" content={data.product.images[0].image.url} />
  {/if}

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:url" content={`https://bidmo.to/products/${data.product?.id || ''}`} />
  <meta property="twitter:title" content={data.product?.title || 'Product'} />
  <meta property="twitter:description" content={data.product?.description || 'Check out this product on BidMo.to'} />
  {#if data.product?.images && data.product.images.length > 0 && data.product.images[0].image}
    <meta property="twitter:image" content={data.product.images[0].image.url} />
  {/if}
</svelte:head>

{#if !data.product}
  <div class="error">
    <h1>Product Not Found</h1>
    <p>The product you're looking for doesn't exist.</p>
    <a href={backLink}>{backLinkText}</a>
  </div>
{:else}
  <div class="product-detail">
    <div class="product-header">
      <a href={backLink} class="back-link">&larr; {backLinkText}</a>
      {#if isOwner}
        <button class="edit-product-btn" onclick={openEditModal}>
          ✏️ Edit Product
        </button>
      {/if}
      {#if $authStore.user?.role === 'admin'}
        <button
          class="admin-hide-btn {data.product.active ? '' : 'admin-unhide-btn'}"
          onclick={openAdminModal}
        >
          {data.product.active ? 'Hide Product' : 'Show Product'}
        </button>
      {/if}
    </div>

    <div class="product-content">
      <div class="product-gallery">
        <div class="title-container">
          <h1>{data.product.title}</h1>
          <div
            class="live-indicator"
            class:updating={isUpdating}
            class:connected={connectionStatus === 'connected'}
            title="Real-time updates active (SSE + fallback polling)"
          >
            <span class="live-dot"></span>
            <span class="live-text">LIVE</span>
          </div>
        </div>

        <div class="status-badge status-{data.product.status}">
          {data.product.status}
        </div>

        <ImageSlider images={data.product.images || []} productTitle={data.product.title} />

        <div class="description-section">
          <h3>Description</h3>
          <p>{data.product.description}</p>
        </div>

        <!-- Price Analytics Graph -->
        {#if sortedBids.length > 0 && chartData.length > 0}
          <div class="price-analytics">
            <h3>📊 Price Analytics Over Time</h3>
            <div class="chart-container">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="price-chart">
                <!-- Gradient definition -->
                <defs>
                  <linearGradient id="price-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#dc2626;stop-opacity:0.5" />
                    <stop offset="100%" style="stop-color:#dc2626;stop-opacity:0" />
                  </linearGradient>
                </defs>

                <!-- Grid lines -->
                <line x1="0" y1="0" x2="100" y2="0" class="grid-line" />
                <line x1="0" y1="25" x2="100" y2="25" class="grid-line" />
                <line x1="0" y1="50" x2="100" y2="50" class="grid-line" />
                <line x1="0" y1="75" x2="100" y2="75" class="grid-line" />
                <line x1="0" y1="100" x2="100" y2="100" class="grid-line" />

                <!-- Area under the line -->
                <path
                  d="M 0,100 {chartData.map(d => `L ${d.x},${d.y}`).join(' ')} L 100,100 Z"
                  class="price-area"
                />

                <!-- Price line -->
                <polyline
                  points={chartData.map(d => `${d.x},${d.y}`).join(' ')}
                  class="price-line"
                />

                <!-- Data points -->
                {#each chartData as point, i}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="1.5"
                    class="data-point"
                    class:first-point={i === 0}
                    class:last-point={i === chartData.length - 1}
                  />
                {/each}
              </svg>

              <div class="chart-labels">
                <div class="label-left">
                  <div class="label-title">Starting</div>
                  <div class="label-value">{formatPrice(data.product?.startingPrice || chartData[0]?.price || 0, sellerCurrency)}</div>
                </div>
                <div class="label-center">
                  <div class="label-title">{chartData.length} Bid{chartData.length !== 1 ? 's' : ''}</div>
                </div>
                <div class="label-right">
                  <div class="label-title">Current</div>
                  <div class="label-value">{formatPrice(chartData[chartData.length - 1]?.price || 0, sellerCurrency)}</div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="seller-info">
          <h3>Seller Information</h3>
          <div class="seller-card">
            <div class="seller-header">
              <div class="seller-avatar">
                {#if data.product.seller?.profilePicture && typeof data.product.seller.profilePicture === 'object' && data.product.seller.profilePicture.url}
                  <img src={data.product.seller.profilePicture.url} alt={data.product.seller.name} class="seller-avatar-img" />
                {:else}
                  {data.product.seller?.name?.charAt(0)?.toUpperCase() || '?'}
                {/if}
              </div>
              <div class="seller-details">
                <a href="/users/{data.product.seller?.id}" class="seller-name">
                  {data.product.seller?.name || 'Unknown'}
                </a>
                {#if data.product.seller?.createdAt}
                  <span class="member-since">Member since {new Date(data.product.seller.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                {/if}
              </div>
            </div>

            <div class="seller-stats">
              {#if loadingSellerData}
                <div class="loading-stats">Loading...</div>
              {:else}
                <div class="stat-item">
                  <span class="stat-title">Seller</span>
                  <div class="stat-rating">
                    <StarRating rating={sellerRatingStats?.asSeller?.averageRating || 0} size="small" />
                    <span class="stat-value">{(sellerRatingStats?.asSeller?.averageRating || 0).toFixed(1)}</span>
                  </div>
                  <span class="stat-label">{sellerRatingStats?.asSeller?.totalRatings || 0} rating{(sellerRatingStats?.asSeller?.totalRatings || 0) !== 1 ? 's' : ''}</span>
                </div>
                <div class="stat-divider"></div>
                <div class="stat-item">
                  <span class="stat-title">Buyer</span>
                  <div class="stat-rating">
                    <StarRating rating={sellerRatingStats?.asBuyer?.averageRating || 0} size="small" />
                    <span class="stat-value">{(sellerRatingStats?.asBuyer?.averageRating || 0).toFixed(1)}</span>
                  </div>
                  <span class="stat-label">{sellerRatingStats?.asBuyer?.totalRatings || 0} rating{(sellerRatingStats?.asBuyer?.totalRatings || 0) !== 1 ? 's' : ''}</span>
                </div>
                <div class="stat-divider"></div>
                <div class="stat-item">
                  <span class="stat-value">{sellerCompletedSales}</span>
                  <span class="stat-label">sale{sellerCompletedSales !== 1 ? 's' : ''}</span>
                </div>
              {/if}
            </div>

            {#if data.product.region || data.product.city}
              <div class="seller-location">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span>{data.product.city}{data.product.city && data.product.region ? ', ' : ''}{data.product.region}</span>
              </div>
            {/if}

            <a href="/users/{data.product.seller?.id}" class="view-profile-btn">View Profile</a>
          </div>
        </div>
      </div>

      <div class="product-details">
        {#if !data.product.active}
          <div class="inactive-warning">
            <span class="warning-icon">⚠️</span>
            <span>This product is currently inactive and hidden from Browse Products</span>
          </div>
        {/if}

        {#if !isOwner && !hasAuctionEnded && data.product.status !== 'sold'}
          <div class="price-info">
            {#if showConfetti}
              <div class="confetti-container">
                {#each Array(50) as _, i}
                  <div class="confetti" style="--delay: {i * 0.02}s; --x: {Math.random() * 100}%; --rotation: {Math.random() * 360}deg; --color: {['#ff6b6b', '#4ecdc4', '#45b7d1', '#feca57', '#ff6348', '#1dd1a1'][i % 6]}"></div>
                {/each}
              </div>
            {/if}

            {#if (data.product.status === 'active' || data.product.status === 'available') && data.product.status !== 'sold' && !hasAuctionEnded}
              <div class="countdown-timer-badge">
                <span class="countdown-label">Ends in:</span>
                <span class="countdown-time">{timeRemaining || 'Loading...'}</span>
              </div>
            {/if}

            {#if data.product.currentBid && !hasAuctionEnded && data.product.status !== 'ended' && data.product.status !== 'sold'}
              <div class="highest-bid-container" class:expanded={bidSectionOpen && !isOwner}>
                <div class="highest-bid-header">
                  <div class="highest-bid-label" class:label-pulse={priceChanged}>CURRENT HIGHEST BID</div>
                </div>
                <div class="bid-with-percentage">
                  <div class="highest-bid-amount" class:price-animate={priceChanged}>{formatPrice(data.product.currentBid, sellerCurrency)}</div>
                  {#if data.product.currentBid && data.product.currentBid > data.product.startingPrice}
                    <div class="percentage-increase">
                      <svg class="arrow-up-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                      <span class="percentage-text">{percentageIncrease}%</span>
                    </div>
                  {/if}
                </div>
                <div class="starting-price-small">Starting price: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
                {#if !isOwner}
                  <button class="bid-toggle-pill" onclick={() => bidSectionOpen = !bidSectionOpen} aria-label={bidSectionOpen ? 'Hide bid form' : 'Show bid form'}>
                    <span class="pill-text">{bidSectionOpen ? 'Close' : 'Place Bid'}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class:chevron-up={bidSectionOpen}>
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                {/if}
              </div>
            {:else if !hasAuctionEnded && data.product.status !== 'ended'}
              <div class="highest-bid-container" class:expanded={bidSectionOpen && !isOwner}>
                <div class="highest-bid-header">
                  <div class="highest-bid-label">STARTING BID</div>
                </div>
                <div class="highest-bid-amount">{formatPrice(data.product.startingPrice, sellerCurrency)}</div>
                <div class="starting-price-small">No bids yet - be the first!</div>
                {#if !isOwner}
                  <button class="bid-toggle-pill" onclick={() => bidSectionOpen = !bidSectionOpen} aria-label={bidSectionOpen ? 'Hide bid form' : 'Show bid form'}>
                    <span class="pill-text">{bidSectionOpen ? 'Close' : 'Place Bid'}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class:chevron-up={bidSectionOpen}>
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if (data.product.status === 'active' || data.product.status === 'available') && !hasAuctionEnded}
          {#if isOwner}
            <!-- Owner view - Accept Bid section -->
            <div class="bid-section owner-section">
              <div class="bid-section-header">
                <h3>Your Listing</h3>
                <div class="countdown-timer-inline">
                  <span class="countdown-label">Ends in:</span>
                  <span class="countdown-time">{timeRemaining || 'Loading...'}</span>
                </div>
              </div>

              {#if highestBid}
                <div class="highest-bid-info">
                  <p class="info-text">Current Highest Bid:</p>
                  <p class="bid-amount-large">{formatPrice(highestBid.amount, sellerCurrency)}</p>
                  <p class="bidder-info">by {getBidderName(highestBid)}</p>
                </div>

                <button class="accept-bid-btn" onclick={openAcceptBidModal}>
                  ✓ Accept Bid & Close Auction
                </button>
              {:else}
                <div class="info-message">
                  <p>No bids yet. Waiting for bidders...</p>
                </div>
              {/if}
            </div>
          {:else}
            <!-- Bidder view - Place Bid section (collapsible) -->
            <div class="bid-section" class:bid-section-open={bidSectionOpen} class:bid-section-closed={!bidSectionOpen}>
              <div class="bid-section-content">
                <div class="bid-section-header">
                  <h3>Place Your Bid</h3>
                </div>

                {#if !$authStore.isAuthenticated}
                  <div class="info-message">
                    <p>🔒 You must be logged in to place a bid</p>
                  </div>
                {/if}

                {#if bidError}
                  <div class="error-message">
                    {bidError}
                  </div>
                {/if}

                <div class="bid-form">
                  <div class="bid-input-group">
                    <label>Your Bid Amount</label>
                    <div class="bid-row">
                      <div class="bid-control">
                        <button
                          class="bid-arrow-btn"
                          onclick={decrementBid}
                          disabled={bidding || bidAmount <= minBid}
                          type="button"
                          aria-label="Decrease bid"
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </button>
                        <input
                          type="number"
                          class="bid-amount-input"
                          bind:value={bidAmount}
                          onblur={validateBidAmount}
                          min={minBid}
                          step={bidInterval}
                          disabled={bidding}
                        />
                        <button
                          class="bid-arrow-btn"
                          onclick={incrementBid}
                          disabled={bidding}
                          type="button"
                          aria-label="Increase bid"
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="18 15 12 9 6 15"></polyline>
                          </svg>
                        </button>
                      </div>
                      <button class="place-bid-btn" onclick={handlePlaceBid} disabled={bidding}>
                        {bidding ? 'Placing Bid...' : 'Place Bid'}
                      </button>
                    </div>
                    <p class="bid-hint">
                      Minimum bid: {formatPrice(minBid, sellerCurrency)} • Increment: {formatPrice(bidInterval, sellerCurrency)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        {:else if hasAuctionEnded || data.product.status === 'ended' || data.product.status === 'sold'}
          <!-- Auction has ended - show results -->
          <div class="auction-ended-section">
            <div class="ended-header">
              <h3>🏁 Auction Ended</h3>
            </div>
            {#if highestBid}
              <div class="winner-info">
                <div class="winner-label">Winning Bid:</div>
                <div class="winner-amount-with-increase">
                  <div class="winner-amount">{formatPrice(highestBid.amount, sellerCurrency)}</div>
                  {#if highestBid.amount > data.product.startingPrice}
                    <div class="winner-percentage-increase">
                      <svg class="arrow-up-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                      <span class="percentage-text">{percentageIncrease}%</span>
                    </div>
                  {/if}
                </div>
                <div class="winner-bidder">Winner: {getBidderName(highestBid)}</div>
                <div class="starting-price-note">Starting price: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
              </div>
            {:else}
              <div class="no-winner-info">
                <div class="no-winner-icon">📭</div>
                <div class="no-winner-text">No Winning Bid</div>
                <div class="no-winner-desc">This auction ended without any bids.</div>
                <div class="starting-price-note">Starting price was: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
              </div>
            {/if}
          </div>
        {/if}

        {#if (isHighestBidder || wasOutbid) && !isOwner}
          {#if (data.product.status === 'active' || data.product.status === 'available') && !hasAuctionEnded}
            <!-- Active auction - bidder status alert -->
            {#if isHighestBidder}
              <div class="highest-bidder-alert" class:animate-in={!wasOutbid}>
                <span class="alert-icon">👑</span>
                <span class="alert-text">{currentBidderMessage || "You're currently the highest bidder!"}</span>
              </div>
            {:else if wasOutbid}
              <div class="outbid-alert" class:shake={outbidAnimating}>
                <span class="alert-icon">😰</span>
                <span class="alert-text">{currentBidderMessage}</span>
              </div>
            {/if}
          {:else if hasAuctionEnded || data.product.status === 'ended' || data.product.status === 'sold'}
            <!-- Auction ended - winner alert -->
            <div class="winner-alert">
              <div class="winner-alert-header">
                <span class="alert-icon">🎉</span>
                <span class="alert-text">Congratulations! You won this auction!</span>
              </div>
              <p class="winner-alert-message">Please contact the seller to arrange payment and delivery.</p>
              <a href="/inbox?product={data.product.id}" class="winner-message-btn">
                💬 Message Seller
              </a>
            </div>
          {/if}
        {/if}

        <!-- Contact Section for Seller -->
        {#if $authStore.isAuthenticated && isOwner && highestBid && data.product.status === 'sold'}
          <!-- Sellers can contact buyer only after accepting the bid -->
          <div class="contact-section">
            <a href="/inbox?product={data.product.id}" class="contact-btn">
              💬 Contact Buyer
            </a>
          </div>
        {/if}

        {#if sortedBids.length > 0}
          <div class="bid-history">
            <h3>Bid History</h3>
            <div class="bid-history-list">
              {#each sortedBids.slice(0, 10) as bid, index (bid.id)}
                <div
                  class="bid-history-item"
                  class:rank-1={index === 0}
                  class:new-bid={newBidIds.has(bid.id)}
                  style="--rank: {index + 1}; --delay: {index * 0.05}s"
                >
                  {#if newBidIds.has(bid.id)}
                    <div class="new-bid-indicator">NEW!</div>
                  {/if}
                  <div class="bid-rank">#{index + 1}</div>
                  <div class="bid-info">
                    <div class="bid-amount">{formatPrice(bid.amount, sellerCurrency)}</div>
                    <div class="bid-details">
                      <span class="bidder-name">{getBidderName(bid)}</span>
                      <span class="bid-time">{formatDate(bid.bidTime)}</span>
                    </div>
                  </div>
                  {#if index === 0}
                    <div class="highest-badge">
                      👑 HIGHEST BID
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Confirm Bid Modal -->
{#if showConfirmBidModal && data.product}
  <div class="modal-overlay" onclick={cancelBid}>
    <div class="modal-content confirm-modal" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={cancelBid}>&times;</button>

      <div class="modal-header">
        <h2>Confirm Your Bid</h2>
      </div>

      <div class="modal-body">
        <div class="confirm-details">
          <p class="product-title">{data.product.title}</p>

          <div class="bid-confirmation">
            <div class="confirm-row">
              <span class="label">Your Bid:</span>
              <span class="value bid-value">{formatPrice(bidAmount, sellerCurrency)}</span>
            </div>

            {#if data.product.currentBid}
              <div class="confirm-row">
                <span class="label">Current Highest:</span>
                <span class="value">{formatPrice(data.product.currentBid, sellerCurrency)}</span>
              </div>
            {:else}
              <div class="confirm-row">
                <span class="label">Starting Price:</span>
                <span class="value">{formatPrice(data.product.startingPrice, sellerCurrency)}</span>
              </div>
            {/if}
          </div>

          <p class="confirm-message">
            Are you sure you want to place this bid? This action cannot be undone.
          </p>

          <div class="privacy-toggle">
            <label class="toggle-label">
              <input type="checkbox" bind:checked={censorMyName} />
              <span class="toggle-text">
                🔒 Hide my full name (show only initials)
              </span>
            </label>
            <p class="toggle-hint">
              {censorMyName ? `Your name will appear as: ${censorName($authStore.user?.name || 'Your Name')}` : 'Your full name will be visible in bid history'}
            </p>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel-bid" onclick={cancelBid}>
            Cancel
          </button>
          <button class="btn-confirm-bid" onclick={confirmPlaceBid}>
            Confirm Bid
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Accept Bid Modal -->
{#if showAcceptBidModal && highestBid}
  <div class="modal-overlay">
    <div class="modal-content confirm-modal">
      <button class="modal-close" onclick={closeAcceptBidModal}>&times;</button>

      <div class="modal-header">
        <h2>Accept Bid & Close Auction</h2>
      </div>

      <div class="modal-body">
        {#if acceptSuccess}
          <div class="success-message">
            Bid accepted! Auction closed. Refreshing...
          </div>
        {/if}

        {#if acceptError}
          <div class="error-message">
            {acceptError}
          </div>
        {/if}

        <div class="confirm-details">
          <p class="product-title">{data.product?.title}</p>

          <div class="bid-confirmation accept-confirmation">
            <div class="confirm-row">
              <span class="label">Winning Bid:</span>
              <span class="value bid-value">{formatPrice(highestBid.amount, sellerCurrency)}</span>
            </div>

            <div class="confirm-row">
              <span class="label">Winner:</span>
              <span class="value">{getBidderName(highestBid)}</span>
            </div>

            <div class="confirm-row">
              <span class="label">Bid Time:</span>
              <span class="value">{formatDate(highestBid.bidTime)}</span>
            </div>
          </div>

          <p class="confirm-message warning-message">
            ⚠️ Are you sure you want to accept this bid? This will close the auction and mark the item as SOLD. This action cannot be undone.
          </p>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel-bid" onclick={closeAcceptBidModal} disabled={accepting}>
            Cancel
          </button>
          <button class="btn-accept-bid" onclick={confirmAcceptBid} disabled={accepting}>
            {accepting ? 'Accepting...' : 'Accept Bid & Close'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Success Toast -->
{#if bidSuccess}
  <div class="success-toast">
    <div class="toast-confetti">
      {#each Array(20) as _, i}
        <div class="toast-confetti-piece" style="--i: {i}; --x: {Math.random() * 100}%; --delay: {Math.random() * 0.5}s; --color: {['#ff6b6b', '#4ecdc4', '#45b7d1', '#feca57', '#ff6348', '#1dd1a1', '#667eea', '#f368e0'][i % 8]}"></div>
      {/each}
    </div>
    <div class="toast-content">
      <div class="toast-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div class="toast-text">
        <span class="toast-title">Bid Placed Successfully!</span>
        <span class="toast-subtitle">You're now the highest bidder</span>
      </div>
      <button class="toast-close" onclick={closeSuccessAlert} aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="toast-progress"></div>
  </div>
{/if}

<!-- Login Modal -->
{#if showLoginModal}
  <div class="modal-overlay" onclick={closeModal}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={closeModal}>&times;</button>

      <div class="modal-header">
        <h2>🔒 Login Required</h2>
      </div>

      <div class="modal-body">
        <p>You need to be logged in to place a bid on this product.</p>

        <div class="modal-actions">
          <a href="/login?redirect=/products/{data.product?.id}" class="btn-login">
            Login
          </a>
          <a href="/register?redirect=/products/{data.product?.id}" class="btn-register">
            Create Account
          </a>
        </div>

        <p class="modal-note">
          Don't have an account? Register now to start bidding!
        </p>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Product Modal -->
{#if showEditModal}
  <div class="modal-overlay">
    <div class="modal-content edit-modal">
      <button class="modal-close" onclick={closeEditModal}>&times;</button>

      <div class="modal-header">
        <h2>Edit Product</h2>
      </div>

      <div class="modal-body">
        <ProductForm
          mode="edit"
          product={data.product}
          onSuccess={handleEditSuccess}
          onCancel={closeEditModal}
        />
      </div>
    </div>
  </div>
{/if}

<!-- Admin Hide/Unhide Confirmation Modal -->
{#if adminModalOpen}
  <div class="admin-modal-overlay" onclick={closeAdminModal}>
    <div class="admin-modal-content" onclick={(e) => e.stopPropagation()}>
      <button class="admin-modal-close" onclick={closeAdminModal}>&times;</button>

      <div class="admin-modal-header">
        <h2>{data.product.active ? 'Hide Product' : 'Unhide Product'}</h2>
      </div>

      <div class="admin-modal-body">
        <p class="admin-modal-product-title">"{data.product.title}"</p>
        <p class="admin-modal-description">
          {#if data.product.active}
            This item will be hidden from all users and moved to the <strong>Hidden Items</strong> tab. The seller will not be notified.
          {:else}
            This item will be restored and visible to all users again under <strong>Active Auctions</strong>.
          {/if}
        </p>

        <div class="admin-modal-actions">
          <button class="btn-admin-cancel" onclick={closeAdminModal} disabled={adminModalLoading}>
            Cancel
          </button>
          <button
            class="btn-admin-confirm {data.product.active ? 'btn-admin-hide' : 'btn-admin-unhide'}"
            onclick={confirmToggleVisibility}
            disabled={adminModalLoading}
          >
            {#if adminModalLoading}
              <span class="admin-spinner"></span>
              Processing...
            {:else}
              {data.product.active ? 'Hide Product' : 'Unhide Product'}
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .error {
    text-align: center;
    padding: 4rem 2rem;
  }

  .error a {
    color: var(--color-blue);
    text-decoration: none;
  }

  .product-detail {
    max-width: 1200px;
    margin: 0 auto;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    padding: 2rem;
  }

  .product-header {
    margin-bottom: 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .edit-product-btn {
    padding: 0.75rem 1.5rem;
    background: var(--color-red);
    color: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .edit-product-btn:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  .admin-hide-btn {
    padding: 0.75rem 1.5rem;
    background: #dc3545;
    color: white;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .admin-hide-btn:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
    background: #b02a37;
  }

  .back-link {
    color: var(--color-blue);
    text-decoration: none;
    font-size: 1.1rem;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .product-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
    margin-bottom: 3rem;
  }

  /* Tablet breakpoint for bid controls */
  @media (max-width: 1024px) {
    .bid-amount-input {
      font-size: clamp(1.1rem, 3.5vw, 1.5rem) !important;
    }

    .bid-arrow-btn {
      width: 40px;
      height: 40px;
    }

    .bid-arrow-btn svg {
      width: 20px;
      height: 20px;
    }

    .bid-control {
      padding: 0.375rem;
      gap: 0.375rem;
    }
  }

  @media (max-width: 768px) {
    .product-detail {
      padding: 0.75rem 0;
      border: none !important;
      box-shadow: none !important;
      max-width: none;
      margin-left: -1rem;
      margin-right: -1rem;
      padding-left: 1rem;
      padding-right: 1rem;
    }

    .product-header {
      margin-bottom: 0.5rem;
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 0.4rem;
    }

    .back-link {
      font-size: 0.95rem;
    }

    .edit-product-btn,
    .admin-hide-btn {
      padding: 0.4rem 0.75rem;
      font-size: 0.8rem;
      width: 100%;
      text-align: center;
      box-shadow: 2px 2px 0px var(--color-border);
    }

    .product-content {
      grid-template-columns: 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .title-container {
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .title-container h1 {
      font-size: 1.3rem;
    }

    /* Make modals scrollable on mobile */
    .modal-overlay {
      align-items: flex-start;
      padding: 0.5rem;
    }

    .modal-content {
      width: 100%;
      max-height: calc(100vh - 1rem);
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .edit-modal {
      max-width: 100%;
    }

    .modal-header {
      padding: 1.5rem 1rem 1rem 1rem;
    }

    .modal-header h2 {
      font-size: 1.5rem;
    }

    .modal-body {
      padding: 0 1rem 1rem 1rem;
    }

    .modal-close {
      top: 0.5rem;
      right: 0.5rem;
    }

    /* Stack bid input and button vertically on mobile */
    .bid-row {
      flex-direction: column;
      gap: 0.75rem;
    }

    .bid-control {
      width: 100%;
    }

    .place-bid-btn {
      width: 100%;
      padding: 1rem 2rem;
      font-size: 1.05rem;
    }

    /* Optimize bid section for mobile */
    .bid-section {
      padding: 1rem;
    }

    .bid-section-closed:not(.owner-section) {
      padding: 0 1rem;
    }

    .bid-section-open:not(.owner-section) {
      padding: 1rem;
    }

    .bid-section-header h3 {
      font-size: 1.25rem;
    }

    .bid-toggle-pill {
      padding: 0.5rem 1rem;
      margin-top: 0.5rem;
      font-size: 0.85rem;
    }

    /* Countdown timer adjustments */
    .countdown-timer-badge {
      position: absolute;
      top: 0;
      right: 0;
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
      z-index: 10;
    }

    .countdown-timer-badge .countdown-time {
      font-size: 1rem;
    }

    .countdown-timer-inline {
      padding: 0.5rem 1rem;
    }

    .countdown-timer-inline .countdown-time {
      font-size: 1.125rem;
    }

    /* Bid input adjustments */
    .bid-amount-input {
      font-size: 1.5rem !important;
      min-height: 56px;
    }

    .bid-control {
      min-height: 56px;
    }

    .place-bid-btn {
      min-height: 56px;
    }

    /* Make arrow buttons larger for touch */
    .bid-arrow-btn {
      width: 44px;
      height: 44px;
      min-width: 44px;
    }

    /* Optimize highest bid section for mobile */
    .highest-bid-container {
      padding: 1rem;
      width: 100%;
    }

    .highest-bid-label {
      font-size: 0.8rem;
    }

    .highest-bid-amount {
      font-size: 2rem;
    }

    .percentage-increase {
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
    }

    .percentage-increase .arrow-up-icon {
      width: 14px;
      height: 14px;
    }

    .bid-with-percentage {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    /* Mobile typography adjustments */
    .product-gallery h1 {
      font-size: 1.3rem;
    }

    .product-description h2 {
      font-size: 1.25rem;
    }

    /* Optimize button spacing on mobile */
    .back-link {
      font-size: 0.9rem;
      padding: 0.625rem 1rem;
    }

    /* Ensure price-info container is responsive */
    .price-info {
      padding: 1rem;
      min-height: auto;
    }

    .status-badge {
      padding: 0.3rem 0.75rem;
      font-size: 0.8rem;
      margin-bottom: 0.75rem;
    }

    .description-section,
    .seller-info {
      margin-bottom: 1rem;
    }

    .description-section h3,
    .seller-info h3 {
      margin-bottom: 0.5rem;
      font-size: 1rem;
    }
  }

  .product-gallery h1 {
    font-size: 2.5rem;
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--color-fg);
  }

  .status-badge {
    display: inline-block;
    padding: 0.5rem 1rem;
    font-weight: bold;
    text-transform: uppercase;
    margin-bottom: 1.5rem;
    border: var(--border-bh) solid var(--color-border);
  }

  .status-active {
    background-color: var(--color-blue);
    color: var(--color-white);
  }

  .status-ended {
    background-color: var(--color-red);
    color: var(--color-white);
  }

  .status-sold {
    background-color: var(--color-yellow);
    color: var(--color-fg);
  }

  .status-available {
    background-color: var(--color-blue);
    color: var(--color-white);
  }

  .bid-section-header-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0;
  }

  .bid-section-header-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    transition: opacity 0.2s;
  }

  .bid-section-header-btn:hover {
    opacity: 0.8;
  }

  .bid-section-header-btn h3 {
    margin: 0;
    color: var(--color-fg);
    font-size: 1.5rem;
    text-align: left;
  }

  .accordion-arrow {
    transition: transform 0.3s ease;
    color: var(--color-red);
  }

  .accordion-arrow.open {
    transform: rotate(180deg);
  }

  .countdown-timer-inline {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--color-red);
    padding: 0.75rem 1.25rem;
    box-shadow: var(--shadow-bh-sm);
    border: var(--border-bh) solid var(--color-border);
  }

  .countdown-timer-inline .countdown-label {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .countdown-timer-inline .countdown-time {
    color: var(--color-white);
    font-size: 1.5rem;
    font-weight: 900;
    font-family: 'Courier New', monospace;
    letter-spacing: 1.5px;
  }

  .price-info {
    background: var(--color-blue);
    padding: 2rem;
    margin-bottom: 1.5rem;
    text-align: center;
    box-shadow: var(--shadow-bh-md);
    border: var(--border-bh) solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    position: relative;
  }

  .highest-bid-container {
    color: var(--color-white);
    position: relative;
    width: 100%;
  }

  .highest-bid-header {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
    gap: 0;
  }

  .highest-bid-label {
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 2px;
    opacity: 0.95;
    width: 100%;
    margin-bottom: 0.5rem;
  }

  .countdown-timer-badge {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--color-red);
    padding: 0.75rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 700;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    margin: 0;
    z-index: 10;
  }

  .countdown-timer-badge .countdown-label {
    color: rgba(255, 255, 255, 0.95);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .countdown-timer-badge .countdown-time {
    color: var(--color-white);
    font-weight: 900;
    letter-spacing: 1px;
    font-family: 'Courier New', monospace;
  }

  .bid-with-percentage {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .highest-bid-amount {
    font-size: 3.5rem;
    font-weight: 900;
    line-height: 1;
    color: var(--color-white);
    margin-bottom: 0;
  }

  .percentage-increase {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.625rem 1rem;
    background: var(--color-blue);
    border: 2px solid var(--color-border);
    animation: percentageBounce 2s ease-in-out infinite, percentageGlow 2s ease-in-out infinite;
    box-shadow: var(--shadow-bh-sm);
  }

  .arrow-up-icon {
    color: var(--color-white);
    animation: arrowBounce 1s ease-in-out infinite;
    flex-shrink: 0;
  }

  .percentage-text {
    font-size: 1.25rem;
    font-weight: 900;
    color: var(--color-white);
    letter-spacing: 0.5px;
  }

  @keyframes percentageBounce {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }

  @keyframes percentageGlow {
    0%, 100% {
      box-shadow: var(--shadow-bh-sm);
      border-color: var(--color-border);
    }
    50% {
      box-shadow: var(--shadow-bh-md);
      border-color: var(--color-blue);
    }
  }

  @keyframes arrowBounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-4px);
    }
  }

  .starting-price-small {
    font-size: 0.95rem;
    opacity: 0.9;
    font-weight: 500;
  }

  /* Inactive Warning Banner */
  .inactive-warning {
    background: var(--color-yellow);
    color: var(--color-fg);
    padding: 1rem 1.5rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 600;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    animation: warningPulse 2s ease-in-out infinite;
  }

  .warning-icon {
    font-size: 1.5rem;
    animation: warningBounce 1s ease-in-out infinite;
  }

  @keyframes warningPulse {
    0%, 100% {
      box-shadow: var(--shadow-bh-sm);
    }
    50% {
      box-shadow: var(--shadow-bh-md);
    }
  }

  @keyframes warningBounce {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }

  /* Sold Info Styles */
  .sold-info {
    background: var(--color-blue) !important;
    box-shadow: var(--shadow-bh-md) !important;
  }

  .sold-badge {
    font-size: 1.2rem;
    font-weight: 900;
    letter-spacing: 3px;
    margin-bottom: 0.75rem;
    color: var(--color-white);
    background-color: rgba(255, 255, 255, 0.2);
    padding: 0.5rem 1.5rem;
    display: inline-block;
    border: var(--border-bh) solid var(--color-border);
  }

  .sold-to-info {
    font-size: 1.1rem;
    font-weight: 600;
    margin-top: 0.75rem;
    color: var(--color-white);
    opacity: 0.95;
  }

  /* Highest Bidder Alert */
  .highest-bidder-alert {
    background: var(--color-yellow);
    border: var(--border-bh) solid var(--color-border);
    padding: 1.25rem 1.5rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    box-shadow: var(--shadow-bh-sm);
    animation: alertPulse 2s ease-in-out infinite;
  }

  @keyframes alertPulse {
    0%, 100% {
      box-shadow: var(--shadow-bh-sm);
      transform: scale(1);
    }
    50% {
      box-shadow: var(--shadow-bh-md);
      transform: scale(1.02);
    }
  }

  .alert-icon {
    font-size: 2rem;
    animation: crownBounce 1.5s ease-in-out infinite;
  }

  @keyframes crownBounce {
    0%, 100% {
      transform: translateY(0) rotate(-10deg);
    }
    50% {
      transform: translateY(-5px) rotate(10deg);
    }
  }

  .alert-text {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-fg);
    letter-spacing: 0.5px;
  }

  /* Animate in effect for highest bidder */
  .highest-bidder-alert.animate-in {
    animation: slideInBounce 0.5s ease-out, alertPulse 2s ease-in-out 0.5s infinite;
  }

  @keyframes slideInBounce {
    0% {
      opacity: 0;
      transform: translateY(-20px) scale(0.9);
    }
    60% {
      transform: translateY(5px) scale(1.02);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* Outbid Alert */
  .outbid-alert {
    background: var(--color-red);
    border: var(--border-bh) solid var(--color-border);
    padding: 1.25rem 1.5rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    box-shadow: var(--shadow-bh-sm);
    animation: outbidPulse 1.5s ease-in-out infinite;
  }

  .outbid-alert .alert-icon {
    font-size: 2rem;
    animation: panicShake 0.5s ease-in-out infinite;
  }

  .outbid-alert .alert-text {
    color: var(--color-white);
    flex: 1;
  }

  .outbid-alert.shake {
    animation: shakeAlert 0.5s ease-in-out;
  }

  @keyframes outbidPulse {
    0%, 100% {
      box-shadow: var(--shadow-bh-sm);
    }
    50% {
      box-shadow: var(--shadow-bh-md);
    }
  }

  @keyframes shakeAlert {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
    20%, 40%, 60%, 80% { transform: translateX(8px); }
  }

  @keyframes panicShake {
    0%, 100% { transform: rotate(-15deg); }
    50% { transform: rotate(15deg); }
  }

  /* Winner Alert */
  .winner-alert {
    background: var(--color-blue);
    border: var(--border-bh) solid var(--color-border);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: var(--shadow-bh-sm);
    animation: winnerPulse 2s ease-in-out infinite;
  }

  @keyframes winnerPulse {
    0%, 100% {
      box-shadow: var(--shadow-bh-sm);
      transform: scale(1);
    }
    50% {
      box-shadow: var(--shadow-bh-md);
      transform: scale(1.01);
    }
  }

  .winner-alert-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .winner-alert-header .alert-icon {
    font-size: 2.5rem;
    animation: celebrationBounce 1s ease-in-out infinite;
  }

  @keyframes celebrationBounce {
    0%, 100% {
      transform: scale(1) rotate(0deg);
    }
    25% {
      transform: scale(1.1) rotate(-10deg);
    }
    75% {
      transform: scale(1.1) rotate(10deg);
    }
  }

  .winner-alert-header .alert-text {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-white);
    letter-spacing: 0.5px;
  }

  .winner-alert-message {
    color: var(--color-white);
    font-size: 1rem;
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  .winner-message-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    background: var(--color-white);
    color: var(--color-blue);
    text-decoration: none;
    font-weight: 700;
    font-size: 1.125rem;
    transition: all 0.2s;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
  }

  .winner-message-btn:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
    background: var(--color-muted);
  }

  .bid-section {
    background-color: var(--color-muted);
    padding: 1.5rem;
    margin-bottom: 2rem;
    display: flex;
    flex-direction: column;
    transition: all 0.3s ease;
    border: var(--border-bh) solid var(--color-border);
  }

  /* Collapsible bid section styles */
  .bid-section:not(.owner-section) {
    overflow: hidden;
    transition: max-height 0.4s ease-out, opacity 0.3s ease, padding 0.3s ease, margin 0.3s ease;
    margin-top: -8px;
  }

  .bid-section-closed:not(.owner-section) {
    max-height: 0;
    opacity: 0;
    padding: 0 1.5rem;
    margin-bottom: 0;
    pointer-events: none;
  }

  .bid-section-open:not(.owner-section) {
    max-height: 500px;
    opacity: 1;
    padding: 1.5rem;
  }

  .bid-section-content {
    display: flex;
    flex-direction: column;
  }

  /* Pill toggle button */
  .bid-toggle-pill {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    width: auto;
    margin: 0.75rem auto 0;
    padding: 0.625rem 1.25rem;
    background: var(--color-blue);
    border: var(--border-bh) solid var(--color-border);
    cursor: pointer;
    color: var(--color-white);
    font-weight: 600;
    font-size: 0.9rem;
    box-shadow: var(--shadow-bh-sm);
    transition: all 0.2s ease;
  }

  .bid-toggle-pill:hover {
    background: var(--color-red);
    box-shadow: var(--shadow-bh-md);
    transform: translateY(-1px);
  }

  .bid-toggle-pill:active {
    transform: translateY(0);
    box-shadow: var(--shadow-bh-sm);
  }

  .bid-toggle-pill .pill-text {
    letter-spacing: 0.02em;
  }

  .bid-toggle-pill svg {
    transition: transform 0.3s ease;
  }

  .bid-toggle-pill svg.chevron-up {
    transform: rotate(180deg);
  }

  /* Expanded highest-bid-container styling */
  .highest-bid-container.expanded {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    margin-bottom: 0;
  }

  .auction-ended-section {
    background: var(--color-muted);
    padding: 2rem;
    margin-bottom: 2rem;
    text-align: center;
    border: var(--border-bh) solid var(--color-border);
  }

  .ended-header h3 {
    font-size: 1.5rem;
    color: var(--color-fg);
    margin-bottom: 1.5rem;
  }

  .winner-info {
    background: var(--color-white);
    padding: 1.5rem;
    border: 2px solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
  }

  .winner-label {
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }

  .winner-amount-with-increase {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .winner-amount {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--color-blue);
  }

  .winner-percentage-increase {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--color-blue);
    color: var(--color-white);
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 600;
    border: 2px solid var(--color-border);
  }

  .winner-percentage-increase .arrow-up-icon {
    width: 16px;
    height: 16px;
    stroke-width: 3;
  }

  .winner-bidder {
    font-size: 1.125rem;
    color: var(--color-fg);
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .starting-price-note {
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.7;
    margin-top: 0.5rem;
  }

  .no-winner-info {
    padding: 1.5rem;
  }

  .no-winner-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .no-winner-text {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-red);
    margin-bottom: 0.5rem;
  }

  .no-winner-desc {
    font-size: 1rem;
    color: var(--color-fg);
    opacity: 0.7;
  }

  .contact-section {
    margin-bottom: 2rem;
  }

  .contact-btn {
    display: block;
    width: 100%;
    padding: 1rem;
    background: var(--color-red);
    color: var(--color-white);
    text-align: center;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    transition: transform 0.2s, box-shadow 0.2s;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
  }

  .contact-btn:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  .bid-form {
    margin-top: 1rem;
    animation: slideDown 0.3s ease-out;
    transform-origin: top;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
      max-height: 0;
    }
    to {
      opacity: 1;
      transform: translateY(0);
      max-height: 500px;
    }
  }

  .bid-input-group {
    width: 100%;
  }

  .bid-row {
    display: flex;
    gap: 1rem;
    align-items: stretch;
  }

  .bid-input-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: var(--color-fg);
  }

  .bid-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background-color: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    padding: 0.5rem;
    flex: 1;
    min-height: 64px;
    min-width: 0;
    overflow: hidden;
  }

  .bid-arrow-btn {
    background: var(--color-blue);
    color: var(--color-white);
    border: 2px solid var(--color-border);
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .bid-arrow-btn:hover:not(:disabled) {
    transform: scale(1.1);
    box-shadow: var(--shadow-bh-sm);
  }

  .bid-arrow-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .bid-arrow-btn:disabled {
    background: var(--color-muted);
    cursor: not-allowed;
    opacity: 0.5;
  }

  .bid-arrow-btn svg {
    pointer-events: none;
  }

  .bid-amount-display {
    flex: 1;
    text-align: center;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--color-blue);
    padding: 0.5rem;
  }

  .bid-amount-input {
    flex: 1;
    text-align: center;
    font-size: clamp(1.25rem, 4vw, 1.75rem);
    font-weight: 700;
    color: var(--color-blue);
    padding: 0.25rem;
    border: none;
    background: transparent;
    outline: none;
    width: 100%;
    min-width: 0;
  }

  .bid-amount-input:focus {
    color: var(--color-blue);
    background: var(--color-muted);
  }

  .bid-amount-input::-webkit-inner-spin-button,
  .bid-amount-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .bid-amount-input[type=number] {
    -moz-appearance: textfield;
  }

  .bid-hint {
    margin-top: 0.5rem;
    margin-bottom: 0;
    font-size: 0.9rem;
    color: var(--color-fg);
    opacity: 0.7;
    font-weight: 500;
  }

  .place-bid-btn {
    padding: 0 2.5rem;
    font-size: 1.1rem;
    font-weight: 700;
    background: var(--color-red);
    color: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    white-space: nowrap;
    min-height: 64px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .place-bid-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  .place-bid-btn:disabled {
    background: var(--color-muted);
    color: var(--color-fg);
    cursor: not-allowed;
    transform: none;
  }

  .success-message {
    background-color: var(--color-blue);
    color: var(--color-white);
    padding: 1rem;
    margin-bottom: 1rem;
    animation: slideDown 0.3s ease-out;
    border: var(--border-bh) solid var(--color-border);
  }

  .error-message {
    background-color: var(--color-red);
    color: var(--color-white);
    padding: 1rem;
    margin-bottom: 1rem;
    animation: slideDown 0.3s ease-out;
    border: var(--border-bh) solid var(--color-border);
  }

  .info-message {
    background-color: var(--color-blue);
    color: var(--color-white);
    padding: 1rem;
    margin-bottom: 1rem;
    text-align: center;
    animation: slideDown 0.3s ease-out;
    border: var(--border-bh) solid var(--color-border);
  }

  .info-message p {
    margin: 0;
    font-weight: 500;
  }

  .description-section,
  .seller-info {
    margin-bottom: 2rem;
  }

  .description-section h3,
  .seller-info h3 {
    margin-bottom: 1rem;
  }

  /* Seller Card Styles */
  .seller-card {
    background: var(--color-muted);
    padding: 1.25rem;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
  }

  .seller-header {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    margin-bottom: 1rem;
  }

  .seller-avatar {
    width: 48px;
    height: 48px;
    background: var(--color-blue);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-white);
    font-weight: 600;
    font-size: 1.25rem;
    border: 2px solid var(--color-border);
    overflow: hidden;
    flex-shrink: 0;
  }

  .seller-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .seller-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .seller-name {
    font-weight: 600;
    color: var(--color-fg);
    text-decoration: none;
    font-size: 1.1rem;
  }

  .seller-name:hover {
    color: var(--color-blue);
  }

  .member-since {
    font-size: 0.8rem;
    color: var(--color-fg);
    opacity: 0.7;
  }

  .seller-stats {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 0;
    border-top: 2px solid var(--color-border);
    border-bottom: 2px solid var(--color-border);
    margin-bottom: 1rem;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .stat-rating {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .stat-value {
    font-weight: 600;
    font-size: 1.1rem;
    color: var(--color-fg);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--color-fg);
    opacity: 0.7;
  }

  .stat-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-blue);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-divider {
    width: 2px;
    height: 40px;
    background: var(--color-border);
  }

  .loading-stats {
    font-size: 0.85rem;
    color: var(--color-fg);
    opacity: 0.7;
    padding: 0.5rem 0;
  }

  .seller-location {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.85rem;
    color: var(--color-fg);
    opacity: 0.7;
    margin-bottom: 1rem;
  }

  .seller-location svg {
    color: var(--color-red);
  }

  .view-profile-btn {
    display: block;
    width: 100%;
    padding: 0.75rem;
    background: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    text-align: center;
    color: var(--color-fg);
    font-weight: 500;
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .view-profile-btn:hover {
    background: var(--color-blue);
    border-color: var(--color-border);
    color: var(--color-white);
  }

  /* Price Analytics */
  .price-analytics {
    margin-bottom: 2rem;
  }

  .price-analytics h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.3rem;
    color: var(--color-fg);
  }

  .chart-container {
    padding: 1.5rem;
    background: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
  }

  .price-chart {
    width: 100%;
    height: 200px;
    margin-bottom: 1rem;
  }

  .grid-line {
    stroke: var(--color-border);
    stroke-width: 0.2;
  }

  .price-area {
    fill: url(#price-gradient);
    opacity: 0.2;
  }

  .price-line {
    fill: none;
    stroke: var(--color-red);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .data-point {
    fill: var(--color-red);
    stroke: var(--color-white);
    stroke-width: 0.5;
    vector-effect: non-scaling-stroke;
  }

  .data-point.first-point {
    fill: var(--color-blue);
  }

  .data-point.last-point {
    fill: var(--color-yellow);
    r: 2;
  }

  .chart-labels {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-top: 1rem;
    padding: 1rem;
    background: var(--color-white);
    border: 2px solid var(--color-border);
  }

  .label-left,
  .label-center,
  .label-right {
    text-align: center;
  }

  .label-left {
    text-align: left;
  }

  .label-right {
    text-align: right;
  }

  .label-title {
    font-size: 0.75rem;
    color: var(--color-fg);
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .label-value {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-red);
  }

  .label-left .label-value {
    color: var(--color-blue);
  }

  .label-right .label-value {
    color: var(--color-yellow);
  }

  .label-center .label-title {
    color: var(--color-blue);
    font-size: 0.9rem;
  }

  .bid-history {
    margin-top: 1.5rem;
    margin-bottom: 2rem;
  }

  .bid-history h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.3rem;
    color: var(--color-fg);
  }

  .bid-history-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .bid-history-item {
    --scale: calc(1 - (min(var(--rank), 4) - 1) * 0.06);
    display: flex;
    align-items: center;
    gap: calc(1rem * var(--scale));
    padding: calc(1rem * var(--scale));
    background-color: var(--color-muted);
    border: 2px solid var(--color-border);
    transition: all 0.2s;
  }

  .bid-history-item:hover {
    border-color: var(--color-blue);
    box-shadow: var(--shadow-bh-sm);
  }

  /* Gold styling for #1 ranked bid */
  .bid-history-item.rank-1 {
    background: var(--color-yellow);
    border: 3px solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    position: relative;
  }

  .bid-history-item.rank-1:hover {
    border-color: var(--color-fg);
    box-shadow: var(--shadow-bh-md);
  }

  .bid-rank {
    font-size: calc(1rem * var(--scale));
    font-weight: 700;
    color: var(--color-blue);
    min-width: calc(35px * var(--scale));
  }

  .bid-history-item.rank-1 .bid-rank {
    color: var(--color-fg);
    font-size: calc(1.2rem * var(--scale));
  }

  .bid-info {
    flex: 1;
  }

  .bid-amount {
    font-size: calc(1.3rem * var(--scale));
    font-weight: 700;
    color: var(--color-fg);
    margin-bottom: calc(0.25rem * var(--scale));
  }

  .bid-details {
    display: flex;
    gap: 1rem;
    font-size: calc(0.9rem * var(--scale));
    color: var(--color-fg);
    opacity: 0.7;
  }

  .bidder-name {
    font-weight: 600;
  }

  .bid-time {
    opacity: 0.8;
  }

  .bid-history-item.rank-1 .bid-amount {
    color: var(--color-fg);
    font-weight: 900;
  }

  .bid-history-item.rank-1 .bidder-name {
    color: var(--color-fg);
  }

  .highest-badge {
    position: absolute;
    top: -0.75rem;
    right: 1rem;
    background: var(--color-red);
    color: var(--color-white);
    padding: 0.375rem 0.875rem;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    border: 2px solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
    overflow-y: auto;
    padding: 1rem;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    background-color: var(--color-white);
    max-width: 500px;
    width: 90%;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-md);
    position: relative;
    animation: slideUp 0.3s ease-out;
    margin: auto;
  }

  @keyframes slideUp {
    from {
      transform: translateY(50px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: 2px solid var(--color-border);
    font-size: 2rem;
    color: var(--color-fg);
    opacity: 0.6;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .modal-close:hover {
    background-color: var(--color-muted);
    color: var(--color-fg);
    opacity: 1;
  }

  .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    text-align: center;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.75rem;
    color: var(--color-fg);
  }

  .modal-body {
    padding: 0 2rem 2rem 2rem;
    text-align: center;
  }

  .modal-body > p {
    font-size: 1.1rem;
    color: var(--color-fg);
    opacity: 0.7;
    margin-bottom: 2rem;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .btn-login,
  .btn-register {
    flex: 1;
    padding: 1rem 2rem;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    border: var(--border-bh) solid var(--color-border);
  }

  .btn-login {
    background-color: var(--color-blue);
    color: var(--color-white);
  }

  .btn-login:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  .btn-register {
    background: var(--color-red);
    color: var(--color-white);
  }

  .btn-register:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  .modal-note {
    font-size: 0.9rem;
    color: var(--color-fg);
    opacity: 0.6;
    margin: 0;
  }

  /* Confirm Bid Modal */
  .confirm-modal {
    max-width: 450px;
  }

  .confirm-details {
    text-align: center;
  }

  .product-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-fg);
    margin: 0 0 1.5rem 0;
    padding-bottom: 1rem;
    border-bottom: 2px solid var(--color-border);
  }

  .bid-confirmation {
    background: var(--color-blue);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    border: var(--border-bh) solid var(--color-border);
  }

  .confirm-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    color: var(--color-white);
  }

  .confirm-row:last-child {
    margin-bottom: 0;
  }

  .confirm-row .label {
    font-size: 0.95rem;
    opacity: 0.9;
  }

  .confirm-row .value {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .confirm-row .bid-value {
    font-size: 1.75rem;
    font-weight: 900;
  }

  .confirm-message {
    font-size: 1rem;
    color: var(--color-fg);
    opacity: 0.7;
    margin: 0 0 1.5rem 0;
    line-height: 1.6;
  }

  .privacy-toggle {
    background-color: var(--color-muted);
    border: 2px solid var(--color-border);
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    user-select: none;
  }

  .toggle-label input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: var(--color-red);
  }

  .toggle-text {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-fg);
  }

  .toggle-hint {
    margin: 0.75rem 0 0 0;
    padding-left: 2rem;
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.7;
    font-style: italic;
  }

  .btn-cancel-bid,
  .btn-confirm-bid {
    flex: 1;
    padding: 1rem 2rem;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    border: var(--border-bh) solid var(--color-border);
    cursor: pointer;
  }

  .btn-cancel-bid {
    background-color: var(--color-muted);
    color: var(--color-fg);
  }

  .btn-cancel-bid:hover {
    background-color: var(--color-border);
  }

  .btn-confirm-bid {
    background: var(--color-blue);
    color: var(--color-white);
  }

  .btn-confirm-bid:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  /* Edit Modal Styles */
  .edit-modal {
    max-width: 600px;
  }

  .edit-form {
    text-align: left;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: var(--color-fg);
    font-size: 0.95rem;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: var(--border-bh) solid var(--color-border);
    font-size: 1rem;
    font-family: inherit;
    transition: border-color 0.2s;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--color-red);
  }

  .form-group input:disabled,
  .form-group textarea:disabled,
  .form-group select:disabled {
    background-color: var(--color-muted);
    cursor: not-allowed;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 100px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    font-weight: 500;
  }

  .checkbox-label input[type="checkbox"] {
    width: auto;
    cursor: pointer;
    margin: 0;
  }

  .checkbox-label span {
    flex: 1;
  }

  .field-hint {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.7;
    font-style: italic;
  }

  .btn-cancel-edit,
  .btn-save-edit {
    flex: 1;
    padding: 1rem 2rem;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    border: var(--border-bh) solid var(--color-border);
    cursor: pointer;
  }

  .btn-cancel-edit {
    background-color: var(--color-muted);
    color: var(--color-fg);
  }

  .btn-cancel-edit:hover:not(:disabled) {
    background-color: var(--color-border);
  }

  .btn-save-edit {
    background: var(--color-red);
    color: var(--color-white);
  }

  .btn-save-edit:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  .btn-cancel-edit:disabled,
  .btn-save-edit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Owner Section Styles */
  .owner-section {
    background: var(--color-yellow);
    border: var(--border-bh) solid var(--color-border);
  }

  .highest-bid-info {
    text-align: center;
    padding: 1.5rem;
    margin: 1rem 0;
  }

  .info-text {
    font-size: 0.95rem;
    color: var(--color-fg);
    font-weight: 600;
    margin: 0 0 0.5rem 0;
  }

  .bid-amount-large {
    font-size: 2.5rem;
    font-weight: 900;
    color: var(--color-blue);
    margin: 0.5rem 0;
  }

  .bidder-info {
    font-size: 1rem;
    color: var(--color-fg);
    margin: 0.5rem 0 0 0;
  }

  .accept-bid-btn {
    width: 100%;
    padding: 1.25rem;
    font-size: 1.2rem;
    font-weight: 700;
    background: var(--color-blue);
    color: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    margin-top: 1rem;
  }

  .accept-bid-btn:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  /* Accept Bid Modal Styles */
  .accept-confirmation {
    background: var(--color-blue);
  }

  .warning-message {
    background-color: var(--color-yellow);
    border: var(--border-bh) solid var(--color-border);
    padding: 1rem;
    margin-top: 1.5rem;
    color: var(--color-fg);
    font-weight: 600;
  }

  .btn-accept-bid {
    flex: 1;
    padding: 1rem 2rem;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    border: var(--border-bh) solid var(--color-border);
    cursor: pointer;
    background: var(--color-blue);
    color: var(--color-white);
  }

  .btn-accept-bid:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  .btn-accept-bid:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Duration Selector Styles - Tabs */
  .duration-tabs {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    border-bottom: 2px solid var(--color-border);
  }

  .tab-btn {
    padding: 0.75rem 1.5rem;
    background-color: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--color-fg);
    opacity: 0.7;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -2px;
  }

  .tab-btn:hover:not(:disabled) {
    color: var(--color-red);
    opacity: 1;
  }

  .tab-btn.active {
    color: var(--color-red);
    border-bottom-color: var(--color-red);
    opacity: 1;
  }

  .tab-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tab-content {
    margin-top: 1.5rem;
  }

  .tab-pane {
    animation: fadeIn 0.2s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .duration-buttons {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .duration-btn {
    padding: 0.75rem 1.25rem;
    background-color: var(--color-white);
    border: var(--border-bh) solid var(--color-red);
    color: var(--color-red);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .duration-btn:hover:not(:disabled) {
    background-color: var(--color-red);
    color: var(--color-white);
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-sm);
  }

  .duration-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .custom-duration-inputs {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .duration-input-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .duration-input {
    width: 80px;
    padding: 0.625rem;
    font-size: 1rem;
    border: var(--border-bh) solid var(--color-border);
    font-family: inherit;
  }

  .duration-input:focus {
    outline: none;
    border-color: var(--color-red);
  }

  .duration-unit {
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.7;
    font-weight: 500;
  }

  .apply-duration-btn {
    padding: 0.625rem 1.5rem;
    background: var(--color-red);
    color: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .apply-duration-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  .apply-duration-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Success Toast Styles */
  .success-toast {
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    z-index: 10000;
    background: var(--color-blue);
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-md);
    overflow: hidden;
    animation: toastSlideIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    min-width: 320px;
    max-width: 400px;
  }

  @keyframes toastSlideIn {
    from {
      transform: translateX(120%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .toast-confetti {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
  }

  .toast-confetti-piece {
    position: absolute;
    width: 8px;
    height: 8px;
    background: var(--color);
    left: var(--x);
    top: -10px;
    animation: confettiFall 2s ease-out var(--delay) forwards;
    opacity: 0;
  }

  .toast-confetti-piece:nth-child(odd) {
    width: 6px;
    height: 6px;
  }

  @keyframes confettiFall {
    0% {
      opacity: 1;
      transform: translateY(0) rotate(0deg) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(100px) rotate(720deg) scale(0.5);
    }
  }

  .toast-content {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 1rem 1.25rem;
    position: relative;
  }

  .toast-icon {
    width: 44px;
    height: 44px;
    background: rgba(255, 255, 255, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--color-white);
    animation: iconPop 0.5s ease-out 0.2s both;
    border: 2px solid var(--color-border);
  }

  @keyframes iconPop {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
    }
  }

  .toast-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    flex: 1;
  }

  .toast-title {
    font-weight: 700;
    font-size: 1rem;
    color: var(--color-white);
  }

  .toast-subtitle {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.9);
  }

  .toast-close {
    background: rgba(255, 255, 255, 0.2);
    border: 2px solid var(--color-border);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--color-white);
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .toast-close:hover {
    background: rgba(255, 255, 255, 0.35);
    transform: scale(1.1);
  }

  .toast-progress {
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
  }

  .toast-progress::after {
    content: '';
    display: block;
    height: 100%;
    background: rgba(255, 255, 255, 0.8);
    animation: toastProgress 5s linear forwards;
  }

  @keyframes toastProgress {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }

  @media (max-width: 480px) {
    .success-toast {
      top: 1rem;
      right: 1rem;
      left: 1rem;
      min-width: auto;
      max-width: none;
    }
  }

  /* Live Update Indicator */
  .title-container {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .title-container h1 {
    margin: 0;
  }

  .live-indicator {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 700;
    transition: all 0.3s;
    border: 2px solid var(--color-border);
  }

  /* Connected state - Blue (always active with polling) */
  .live-indicator.connected {
    background: var(--color-muted);
    color: var(--color-blue);
  }

  .live-indicator.connected .live-dot {
    background: var(--color-blue);
    animation: pulse-dot 2s ease-in-out infinite;
  }

  /* Updating state - Red (when actively fetching data) */
  .live-indicator.updating {
    background: var(--color-muted);
    border-color: var(--color-red);
    color: var(--color-red);
  }

  .live-indicator.updating .live-dot {
    background: var(--color-red);
    animation: pulse-dot 0.5s ease-in-out infinite;
  }

  .live-dot {
    width: 8px;
    height: 8px;
  }

  .live-text {
    letter-spacing: 0.05em;
  }

  @keyframes pulse-dot {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.2);
    }
  }

  /* Confetti Animation */
  .confetti-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
    z-index: 100;
  }

  .confetti {
    position: absolute;
    top: -10px;
    left: var(--x);
    width: 10px;
    height: 10px;
    background: var(--color);
    opacity: 0;
    animation: confettiFall 3s ease-out var(--delay) forwards;
    transform: rotate(var(--rotation));
  }

  @keyframes confettiFall {
    0% {
      opacity: 1;
      top: -10px;
      transform: rotate(var(--rotation)) translateY(0);
    }
    100% {
      opacity: 0;
      top: 100%;
      transform: rotate(calc(var(--rotation) + 360deg)) translateY(100px);
    }
  }

  /* Price Change Animation */
  .price-animate {
    animation: priceChange 0.8s ease-out;
  }

  @keyframes priceChange {
    0% {
      transform: scale(1);
    }
    25% {
      transform: scale(1.3);
      color: var(--color-yellow);
    }
    50% {
      transform: scale(0.95);
    }
    75% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
    }
  }

  /* Label Pulse Animation */
  .label-pulse {
    animation: labelPulse 0.6s ease-out;
  }

  @keyframes labelPulse {
    0%, 100% {
      background: var(--color-red);
      transform: scale(1);
    }
    50% {
      background: var(--color-blue);
      transform: scale(1.05);
      box-shadow: var(--shadow-bh-md);
    }
  }

  /* New Bid Highlight Animation */
  .bid-history-item {
    position: relative;
    animation: slideIn var(--delay) ease-out;
  }

  .bid-history-item.new-bid {
    animation: newBidHighlight 2s ease-out;
    position: relative;
    overflow: hidden;
  }

  .new-bid-indicator {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--color-blue);
    color: var(--color-white);
    padding: 0.25rem 0.625rem;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    animation: newBadgePulse 1s ease-in-out infinite;
    border: 2px solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    z-index: 10;
  }

  @keyframes newBidHighlight {
    0% {
      background: var(--color-blue);
      transform: translateX(-100%) scale(0.95);
      opacity: 0;
    }
    15% {
      transform: translateX(0) scale(1.02);
      opacity: 1;
    }
    30% {
      background: var(--color-blue);
      box-shadow: var(--shadow-bh-md);
    }
    50% {
      background: var(--color-yellow);
    }
    75% {
      background: var(--color-blue);
    }
    100% {
      background: var(--color-white);
      transform: translateX(0) scale(1);
      box-shadow: var(--shadow-bh-sm);
    }
  }

  @keyframes newBadgePulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Price Info Container */
  .price-info {
    position: relative;
    overflow: visible;
  }

  /* Image Upload Styles */
  .image-upload-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .image-upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    background: var(--color-red);
    color: var(--color-white);
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    border: var(--border-bh) solid var(--color-border);
    font-size: 1rem;
  }

  .image-upload-btn:hover:not(.disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  .image-upload-btn.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .upload-icon {
    font-size: 1.5rem;
  }

  .image-preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }

  .image-preview-item {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border: 2px solid var(--color-border);
    background: var(--color-muted);
  }

  .image-preview-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .remove-image-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 32px;
    height: 32px;
    background: var(--color-red);
    color: var(--color-white);
    border: 2px solid var(--color-border);
    font-size: 1.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    font-weight: bold;
    line-height: 1;
    z-index: 2;
  }

  .remove-image-btn:hover:not(:disabled) {
    background: var(--color-fg);
    transform: scale(1.1);
  }

  .remove-image-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .image-number {
    position: absolute;
    bottom: 0.5rem;
    left: 0.5rem;
    background: var(--color-fg);
    color: var(--color-white);
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .image-type {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    background: var(--color-blue);
    color: var(--color-white);
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  @media (max-width: 768px) {
    .image-preview-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
  }

  /* Admin unhide button variant */
  .admin-unhide-btn {
    background: #198754 !important;
  }

  .admin-unhide-btn:hover {
    background: #146c43 !important;
  }

  /* Admin Confirmation Modal */
  .admin-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: adminOverlayFadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 1rem;
    backdrop-filter: blur(2px);
  }

  @keyframes adminOverlayFadeIn {
    from { opacity: 0; backdrop-filter: blur(0); }
    to { opacity: 1; backdrop-filter: blur(2px); }
  }

  .admin-modal-content {
    background-color: var(--color-white);
    max-width: 460px;
    width: 90%;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-md);
    position: relative;
    animation: adminModalSlideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes adminModalSlideUp {
    from { transform: translateY(30px) scale(0.97); opacity: 0; }
    to { transform: translateY(0) scale(1); opacity: 1; }
  }

  .admin-modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: 2px solid var(--color-border);
    font-size: 2rem;
    color: var(--color-fg);
    opacity: 0.6;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.15s ease, opacity 0.15s ease, transform 0.15s ease;
  }

  .admin-modal-close:hover {
    background-color: var(--color-muted);
    opacity: 1;
    transform: scale(1.05);
  }

  .admin-modal-header {
    padding: 2rem 2rem 1rem 2rem;
    text-align: center;
  }

  .admin-modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--color-fg);
  }

  .admin-modal-body {
    padding: 0 2rem 2rem 2rem;
    text-align: center;
  }

  .admin-modal-product-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-fg);
    margin-bottom: 0.75rem;
  }

  .admin-modal-description {
    font-size: 0.95rem;
    color: var(--color-fg);
    opacity: 0.7;
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }

  .admin-modal-actions {
    display: flex;
    gap: 1rem;
  }

  .btn-admin-cancel,
  .btn-admin-confirm {
    flex: 1;
    padding: 0.85rem 1.5rem;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1),
                box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1),
                background-color 0.15s ease;
    border: var(--border-bh) solid var(--color-border);
  }

  .btn-admin-cancel {
    background-color: var(--color-muted);
    color: var(--color-fg);
  }

  .btn-admin-cancel:hover {
    background-color: var(--color-border);
  }

  .btn-admin-hide {
    background: #dc3545;
    color: white;
  }

  .btn-admin-hide:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
    background: #b02a37;
  }

  .btn-admin-unhide {
    background: #198754;
    color: white;
  }

  .btn-admin-unhide:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
    background: #146c43;
  }

  .btn-admin-confirm:disabled,
  .btn-admin-cancel:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Loading spinner */
  .admin-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: adminSpin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 0.4rem;
  }

  @keyframes adminSpin {
    to { transform: rotate(360deg); }
  }
</style>
