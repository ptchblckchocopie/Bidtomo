<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import { unreadCountStore } from '$lib/stores/inbox';
  import { fetchConversations, fetchProductMessages, fetchMessageById, fetchProduct, fetchProductBids, sendMessage, markMessageAsRead, setTypingStatus, fetchTransactionForProduct, fetchMyRatingForTransaction, createRating, addRatingFollowUp, createVoidRequest, respondToVoidRequest, submitSellerChoice, respondToSecondBidderOffer, getVoidRequestsForTransaction, type VoidRequest } from '$lib/api';
  import type { Product, Message, Transaction, Rating } from '$lib/api';
  import StarRating from '$lib/components/StarRating.svelte';
  import KebabMenu from '$lib/components/KebabMenu.svelte';
  import { goto } from '$app/navigation';
  import { getUserSSE, disconnectUserSSE, getProductSSE, disconnectProductSSE, type SSEEvent, type MessageEvent as SSEMessageEvent, type TypingEvent } from '$lib/sse';

  function handleBackToList() {
    selectedProduct = null;
    // Clear URL parameter
    goto('/inbox', { replaceState: true });
  }

  // Handle kebab menu actions
  function handleMenuAction(action: string) {
    if (!selectedProduct) return;

    switch (action) {
      case 'view_product':
        goto(`/products/${selectedProduct.id}?from=inbox`);
        break;
      case 'void_bid':
        openVoidModal();
        break;
    }
  }

  // Void request functions
  function openVoidModal() {
    voidReason = '';
    voidError = '';
    showVoidModal = true;
  }

  function closeVoidModal() {
    showVoidModal = false;
    voidReason = '';
    voidError = '';
  }

  async function handleSubmitVoidRequest() {
    if (!transaction || !voidReason.trim()) {
      voidError = 'Please provide a reason for voiding';
      return;
    }

    submittingVoid = true;
    voidError = '';

    try {
      const result = await createVoidRequest(transaction.id as string, voidReason);
      if (result.success) {
        closeVoidModal();
        // Show success message or update UI
        alert('Void request submitted successfully. Waiting for the other party to respond.');
      } else {
        voidError = result.error || 'Failed to create void request';
      }
    } catch (err: any) {
      voidError = err.message || 'Failed to create void request';
    } finally {
      submittingVoid = false;
    }
  }

  function openVoidApprovalModal(request: VoidRequest) {
    pendingVoidRequest = request;
    voidRejectionReason = '';
    voidError = '';
    showVoidApprovalModal = true;
  }

  function closeVoidApprovalModal() {
    showVoidApprovalModal = false;
    pendingVoidRequest = null;
    voidRejectionReason = '';
    voidError = '';
  }

  async function handleRespondToVoid(action: 'approve' | 'reject') {
    if (!pendingVoidRequest) return;

    if (action === 'reject' && !voidRejectionReason.trim()) {
      voidError = 'Please provide a reason for rejection';
      return;
    }

    submittingVoid = true;
    voidError = '';

    try {
      const result = await respondToVoidRequest(
        pendingVoidRequest.id as string,
        action,
        action === 'reject' ? voidRejectionReason : undefined
      );

      if (result.success) {
        closeVoidApprovalModal();
        if (action === 'approve' && result.requiresSellerChoice) {
          // Check if current user is seller
          const isSeller = selectedProduct?.seller?.id === $authStore.user?.id;
          if (isSeller) {
            showSellerChoiceModal = true;
          } else {
            alert('Void request approved. The seller will decide what to do next.');
          }
        } else {
          alert(action === 'approve' ? 'Void request approved' : 'Void request rejected');
        }
      } else {
        voidError = result.error || 'Failed to respond to void request';
      }
    } catch (err: any) {
      voidError = err.message || 'Failed to respond to void request';
    } finally {
      submittingVoid = false;
    }
  }

  function closeSellerChoiceModal() {
    showSellerChoiceModal = false;
    voidError = '';
  }

  async function handleSellerChoice(choice: 'restart_bidding' | 'offer_second_bidder') {
    if (!pendingVoidRequest && !voidRequest) return;
    const requestId = (pendingVoidRequest?.id || voidRequest?.id) as string;

    submittingVoid = true;
    voidError = '';

    try {
      const result = await submitSellerChoice(requestId, choice);
      if (result.success) {
        closeSellerChoiceModal();
        if (choice === 'restart_bidding') {
          alert(`Auction restarted! ${result.notifiedBidders || 0} bidders have been notified.`);
        } else {
          alert(`Offer sent to the second highest bidder.`);
        }
        // Refresh the page to update product status
        window.location.reload();
      } else {
        if (result.onlyOption === 'restart_bidding') {
          voidError = 'No second bidder available. Please restart the bidding instead.';
        } else {
          voidError = result.error || 'Failed to process choice';
        }
      }
    } catch (err: any) {
      voidError = err.message || 'Failed to process choice';
    } finally {
      submittingVoid = false;
    }
  }

  function openSecondBidderOfferModal(request: VoidRequest) {
    pendingVoidRequest = request;
    voidError = '';
    showSecondBidderOfferModal = true;
  }

  function closeSecondBidderOfferModal() {
    showSecondBidderOfferModal = false;
    pendingVoidRequest = null;
    voidError = '';
  }

  async function handleSecondBidderResponse(action: 'accept' | 'decline') {
    if (!pendingVoidRequest) return;

    submittingVoid = true;
    voidError = '';

    try {
      const result = await respondToSecondBidderOffer(pendingVoidRequest.id as string, action);
      if (result.success) {
        closeSecondBidderOfferModal();
        if (action === 'accept') {
          alert('Congratulations! You have secured the item. Check your inbox for next steps.');
          window.location.reload();
        } else {
          alert('You have declined the offer.');
        }
      } else {
        voidError = result.error || 'Failed to respond to offer';
      }
    } catch (err: any) {
      voidError = err.message || 'Failed to respond to offer';
    } finally {
      submittingVoid = false;
    }
  }

  let conversations: { product: Product; lastMessage: Message; unreadCount: number }[] = $state([]);
  let selectedProduct: Product | null = $state(null);
  let messages: Message[] = $state([]);
  let newMessage = $state('');
  let loading = $state(true);
  let loadingConversation = $state(false);
  let sendingMessage = $state(false);
  let error = $state('');
  let pollingInterval: ReturnType<typeof setInterval> | null = $state(null);
  let conversationListPollingInterval: ReturnType<typeof setInterval> | null = $state(null);
  let lastMessageTime: string | null = $state(null);
  let chatInputElement: HTMLInputElement = $state(undefined as any);
  let typingTimeout: ReturnType<typeof setTimeout> | null = $state(null);
  let productSseUnsubscribe: (() => void) | null = $state(null);
  let currentProductSseId: string | null = $state(null);
  let otherUserTyping = $state(false);
  let iAmTyping = $state(false);
  let activeTab: 'products' | 'purchases' = $state('products');
  let chatMessagesElement: HTMLElement | null = $state(null);
  let shouldAutoScroll = $state(true);
  let loadingOlderMessages = $state(false);
  let hasMoreMessages = $state(true);
  const MESSAGE_PAGE_SIZE = 10;
  let canChat = $state(true);
  let chatBlockedReason = $state('');
  let newMessageIds: Set<string> = $state(new Set());
  let conversationUpdateDebounce: ReturnType<typeof setTimeout> | null = $state(null);
  let sseConnected = $state(false);
  let sseStateUnsubscribe: (() => void) | null = $state(null);

  // Rating state
  let transaction: Transaction | null = $state(null);
  let myRating: Rating | null = $state(null);
  let otherPartyRating: Rating | null = $state(null);
  let showRatingModal = $state(false);
  let ratingValue = $state(0);
  let ratingComment = $state('');
  let submittingRating = $state(false);
  let ratingError = $state('');
  let buyerName: string | null = $state(null);
  let sellerName: string | null = $state(null);

  // Void request state
  let voidRequest: VoidRequest | null = $state(null);
  let showVoidModal = $state(false);
  let showVoidApprovalModal = $state(false);
  let showSellerChoiceModal = $state(false);
  let showSecondBidderOfferModal = $state(false);
  let voidReason = $state('');
  let voidRejectionReason = $state('');
  let submittingVoid = $state(false);
  let voidError = $state('');
  let pendingVoidRequest: VoidRequest | null = $state(null);

  // Get product ID from query params if navigated from purchases page
  let productId = $derived($page.url.searchParams.get('product'));

  // Filter and sort conversations
  let myProductsConversations = $derived.by(() => conversations
    .filter(conv => conv.product.seller?.id === $authStore.user?.id)
    .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()));

  let myPurchasesConversations = $derived.by(() => conversations
    .filter(conv => conv.product.seller?.id !== $authStore.user?.id)
    .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()));

  let displayedConversations = $derived(activeTab === 'products' ? myProductsConversations : myPurchasesConversations);

  // Currency symbols
  const currencySymbols: Record<string, string> = {
    PHP: '₱',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
  };

  function formatPrice(price: number, currency: string): string {
    const symbol = currencySymbols[currency] || currency;
    return `${symbol}${price.toLocaleString()}`;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes === 0 ? 'Just now' : `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  function getOtherUser(message: Message) {
    if (!$authStore.user) return null;

    const sender = typeof message.sender === 'object' ? message.sender : null;
    const receiver = typeof message.receiver === 'object' ? message.receiver : null;

    if (sender && sender.id === $authStore.user.id) {
      return receiver;
    }
    return sender;
  }

  // Check if user is at the bottom of chat
  function isAtBottom() {
    if (!chatMessagesElement) return true;
    const threshold = 100; // pixels from bottom
    const position = chatMessagesElement.scrollHeight - chatMessagesElement.scrollTop - chatMessagesElement.clientHeight;
    return position <= threshold;
  }

  // Check if user is at the top of chat
  function isAtTop() {
    if (!chatMessagesElement) return false;
    const threshold = 50; // pixels from top
    return chatMessagesElement.scrollTop <= threshold;
  }

  // Handle scroll event
  function handleScroll() {
    shouldAutoScroll = isAtBottom();

    // Load older messages when scrolling to the top
    if (isAtTop() && !loadingOlderMessages && hasMoreMessages && selectedProduct) {
      loadOlderMessages();
    }
  }

  // Load older messages (previous 10)
  async function loadOlderMessages() {
    if (!selectedProduct || loadingOlderMessages || !hasMoreMessages) return;

    loadingOlderMessages = true;
    const oldScrollHeight = chatMessagesElement?.scrollHeight || 0;

    try {
      // Get the oldest message timestamp
      const oldestMessage = messages[0];
      if (!oldestMessage) {
        hasMoreMessages = false;
        return;
      }

      const olderMessages = await fetchProductMessages(
        selectedProduct.id,
        undefined,
        { limit: MESSAGE_PAGE_SIZE, before: oldestMessage.createdAt }
      );

      if (olderMessages.length < MESSAGE_PAGE_SIZE) {
        hasMoreMessages = false;
      }

      if (olderMessages.length > 0) {
        // Prepend older messages
        messages = [...olderMessages, ...messages];

        // Maintain scroll position
        await tick();
        if (chatMessagesElement) {
          const newScrollHeight = chatMessagesElement.scrollHeight;
          chatMessagesElement.scrollTop = newScrollHeight - oldScrollHeight;
        }
      } else {
        hasMoreMessages = false;
      }
    } catch (err) {
      console.error('Error loading older messages:', err);
    } finally {
      loadingOlderMessages = false;
    }
  }

  // Smart scroll to bottom
  async function scrollToBottom(force = false) {
    if (!chatMessagesElement || (!shouldAutoScroll && !force)) return;
    await tick(); // Wait for DOM to update
    chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
  }

  // Check if user can chat with this product
  async function checkChatPermission(product: Product): Promise<{ allowed: boolean; reason?: string; isOngoing?: boolean }> {
    if (!$authStore.user) {
      return { allowed: false, reason: 'You must be logged in to chat.' };
    }

    const isSeller = product.seller?.id === $authStore.user.id;

    // Sellers can always chat
    if (isSeller) {
      return { allowed: true };
    }

    // For buyers, check product status
    if ((product.status as string) === 'active') {
      return {
        allowed: false,
        reason: 'The bidding is still ongoing and you can only chat if you won the bid.',
        isOngoing: true
      };
    }

    if (product.status !== 'sold') {
      return {
        allowed: false,
        reason: 'This auction has ended. You can only chat if the seller accepted your bid.'
      };
    }

    // Product is sold - check if user is the highest bidder
    const bids = await fetchProductBids(product.id);
    if (bids.length === 0) {
      return {
        allowed: false,
        reason: 'No bids were placed on this product.'
      };
    }

    // Sort bids by amount (highest first)
    const sortedBids = [...bids].sort((a, b) => b.amount - a.amount);
    const highestBid = sortedBids[0];
    const highestBidderId = typeof highestBid.bidder === 'object' ? highestBid.bidder.id : highestBid.bidder;

    if (highestBidderId !== $authStore.user.id) {
      return {
        allowed: false,
        reason: 'You did not win this bid.'
      };
    }

    return { allowed: true };
  }

  // Load transaction and rating data for the selected product
  async function loadRatingData(product: Product) {
    // Reset rating state
    transaction = null;
    myRating = null;
    otherPartyRating = null;
    buyerName = null;
    sellerName = null;

    // Set seller name
    sellerName = product.seller?.name || 'Unknown Seller';

    // Only load rating data for sold products
    if (product.status !== 'sold') return;

    try {
      // Fetch transaction
      const txn = await fetchTransactionForProduct(product.id);
      if (!txn) return;

      transaction = txn;

      // Get buyer name from transaction
      if (typeof txn.buyer === 'object' && txn.buyer) {
        buyerName = txn.buyer.name || 'Unknown Buyer';
      }

      // Fetch my rating
      myRating = await fetchMyRatingForTransaction(txn.id);

      // Fetch the other party's rating (to show how they rated)
      const response = await fetch(
        `/api/bridge/ratings?where[transaction][equals]=${txn.id}&depth=1`,
        {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        const allRatings = data.docs || [];

        // Find the rating from the other party
        const currentUserId = $authStore.user?.id;
        otherPartyRating = allRatings.find((r: Rating) => {
          const raterId = typeof r.rater === 'object' ? r.rater.id : r.rater;
          return raterId !== currentUserId;
        }) || null;
      }
    } catch (err) {
      console.error('Error loading rating data:', err);
    }
  }

  // Submit a new rating
  async function submitRating() {
    if (!transaction || ratingValue === 0) return;

    submittingRating = true;
    ratingError = '';

    try {
      const newRating = await createRating(transaction.id, ratingValue, ratingComment || undefined);
      if (newRating) {
        myRating = newRating;
        showRatingModal = false;
        ratingValue = 0;
        ratingComment = '';
      }
    } catch (err: any) {
      ratingError = err.message || 'Failed to submit rating';
    } finally {
      submittingRating = false;
    }
  }

  // Get buyer info from messages or bids
  async function getBuyerFromProduct(product: Product): Promise<string | null> {
    if (!$authStore.user) return null;

    // If user is the seller, find the buyer from messages or bids
    if (product.seller?.id === $authStore.user.id) {
      // Try to get from messages
      const otherUsersInMessages = messages
        .map(m => getOtherUser(m))
        .filter((u, i, arr) => u && arr.findIndex(x => x?.id === u.id) === i);

      if (otherUsersInMessages.length > 0 && otherUsersInMessages[0]) {
        return otherUsersInMessages[0].name || 'Unknown Buyer';
      }

      // Fallback to highest bidder
      try {
        const bids = await fetchProductBids(product.id);
        if (bids.length > 0) {
          const sortedBids = [...bids].sort((a, b) => b.amount - a.amount);
          const highestBid = sortedBids[0];
          if (typeof highestBid.bidder === 'object' && highestBid.bidder) {
            return highestBid.bidder.name || 'Unknown Buyer';
          }
        }
      } catch (err) {
        console.error('Error fetching bids:', err);
      }
    }

    return null;
  }

  async function loadConversations() {
    loading = true;
    try {
      conversations = await fetchConversations();

      // If product ID is in URL, auto-select that conversation or load the product
      if (productId) {
        const conv = conversations.find(c => c.product.id === productId);
        if (conv) {
          // Determine which tab this conversation belongs to
          const isMyProduct = conv.product.seller?.id === $authStore.user?.id;
          activeTab = isMyProduct ? 'products' : 'purchases';

          // Existing conversation found
          await selectConversation(conv.product);
        } else {
          // No conversation yet, but we can still load the product and start messaging
          try {
            const product = await fetchProduct(productId);
            if (product) {
              // Determine which tab this product belongs to
              const isMyProduct = product.seller?.id === $authStore.user?.id;
              activeTab = isMyProduct ? 'products' : 'purchases';

              selectedProduct = product;

              // Reset and check chat permission
              canChat = true;
              chatBlockedReason = '';
              const permission = await checkChatPermission(product);
              canChat = permission.allowed;
              chatBlockedReason = permission.reason || '';

              messages = await fetchProductMessages(product.id, undefined, {
                limit: MESSAGE_PAGE_SIZE,
                latest: true
              });

              // Reset pagination state
              hasMoreMessages = messages.length === MESSAGE_PAGE_SIZE;

              // Update last message time for polling
              if (messages.length > 0) {
                lastMessageTime = messages[messages.length - 1].createdAt;
              } else {
                lastMessageTime = new Date().toISOString();
              }

              // Load rating data for the product
              await loadRatingData(product);

              // If buyer name wasn't set from transaction, try to get it from messages/bids
              if (!buyerName && product.seller?.id === $authStore.user?.id) {
                buyerName = await getBuyerFromProduct(product);
              }

              // Start polling for new messages
              startPolling();

              // Subscribe to SSE for typing status
              subscribeToProductSSE(productId);

              // Reset typing state
              iAmTyping = false;
              otherUserTyping = false;

              // Scroll to bottom after loading messages
              shouldAutoScroll = true;
              await tick();
              setTimeout(() => scrollToBottom(true), 100);
            }
          } catch (err) {
            console.error('Error loading product:', err);
          }
        }
      }

      // Start polling conversation list for updates
      startConversationListPolling();
    } catch (err) {
      error = 'Failed to load conversations';
      console.error('Error loading conversations:', err);
    } finally {
      loading = false;
    }
  }

  // Poll for conversation list updates without disrupting current selection
  async function pollConversationList() {
    try {
      const updatedConversations = await fetchConversations();

      // Update conversations while preserving DOM and selection
      for (const updatedConv of updatedConversations) {
        const existingIndex = conversations.findIndex(c => c.product.id === updatedConv.product.id);

        if (existingIndex !== -1) {
          // Update existing conversation
          const existing = conversations[existingIndex];

          // Only update if there's actually a change to avoid unnecessary re-renders
          if (existing.lastMessage.id !== updatedConv.lastMessage.id ||
              existing.unreadCount !== updatedConv.unreadCount) {
            conversations[existingIndex] = updatedConv;
          }
        } else {
          // New conversation, add it to the list
          conversations = [updatedConv, ...conversations];
        }
      }

      // Remove conversations that no longer exist
      conversations = conversations.filter(conv =>
        updatedConversations.some(updated => updated.product.id === conv.product.id)
      );

    } catch (err) {
      console.error('Error polling conversation list:', err);
    }
  }

  // Start polling conversation list (only as fallback when SSE is disconnected)
  function startConversationListPolling() {
    if (conversationListPollingInterval) {
      clearInterval(conversationListPollingInterval);
    }

    // Only poll if SSE is not connected — SSE handler already triggers
    // pollConversationList() on new_message events with 500ms debounce
    if (sseConnected) {
      return;
    }

    // Poll every 10 seconds as fallback when SSE is not available
    conversationListPollingInterval = setInterval(pollConversationList, 10000);
  }

  // Stop polling conversation list
  function stopConversationListPolling() {
    if (conversationListPollingInterval) {
      clearInterval(conversationListPollingInterval);
      conversationListPollingInterval = null;
    }
  }

  async function selectConversation(product: Product) {
    loadingConversation = true;

    try {
      selectedProduct = product;

      // Reset chat permission state
      canChat = true;
      chatBlockedReason = '';

      // Check chat permission
      const permission = await checkChatPermission(product);
      canChat = permission.allowed;
      chatBlockedReason = permission.reason || '';

      // Load only the latest 10 messages
      messages = await fetchProductMessages(product.id, undefined, {
        limit: MESSAGE_PAGE_SIZE,
        latest: true
      });

      // Reset pagination state
      hasMoreMessages = messages.length === MESSAGE_PAGE_SIZE;

      // Update last message time for polling
      if (messages.length > 0) {
        lastMessageTime = messages[messages.length - 1].createdAt;
      } else {
        lastMessageTime = new Date().toISOString();
      }

      // Mark messages as read and update global unread count
      let markedCount = 0;
      for (const msg of messages) {
        const receiverId = typeof msg.receiver === 'object' ? msg.receiver.id : msg.receiver;
        if (receiverId === $authStore.user?.id && !msg.read) {
          await markMessageAsRead(msg.id);
          markedCount++;
        }
      }
      // Update the store and trigger a refresh of the navbar badge
      if (markedCount > 0) {
        unreadCountStore.decrement(markedCount);
      }

      // Reset local conversation's unread count
      const convIndex = conversations.findIndex(c => c.product.id === product.id);
      if (convIndex !== -1 && conversations[convIndex].unreadCount > 0) {
        conversations[convIndex] = {
          ...conversations[convIndex],
          unreadCount: 0
        };
      }

      // Load rating data for the product
      await loadRatingData(product);

      // If buyer name wasn't set from transaction, try to get it from messages/bids
      if (!buyerName && product.seller?.id === $authStore.user?.id) {
        buyerName = await getBuyerFromProduct(product);
      }

      // Start polling for new messages
      startPolling();

      // Subscribe to SSE for typing status
      if (selectedProduct) {
        subscribeToProductSSE(String(selectedProduct.id));
      }

      // Reset typing state
      iAmTyping = false;
      otherUserTyping = false;

      // Reset auto-scroll and scroll to bottom
      shouldAutoScroll = true;
      setTimeout(() => {
        scrollToBottom(true);
        if (chatInputElement) {
          chatInputElement.focus();
        }
      }, 100);
    } finally {
      loadingConversation = false;
    }
  }

  // Poll for new messages (fallback for SSE - reduced frequency)
  async function pollNewMessages() {
    if (!selectedProduct || !lastMessageTime) return;

    try {
      const newMessages = await fetchProductMessages(selectedProduct.id, lastMessageTime);

      if (newMessages.length > 0) {
        // Filter out messages that already exist to avoid duplicates
        const existingIds = new Set(messages.map(m => m.id));
        const uniqueNewMessages = newMessages.filter(m => !existingIds.has(m.id));

        if (uniqueNewMessages.length > 0) {
          // Add animation for new messages
          for (const msg of uniqueNewMessages) {
            newMessageIds = new Set([...newMessageIds, msg.id]);
          }

          // Add new messages to the list
          messages = [...messages, ...uniqueNewMessages];

          // Update last message time
          lastMessageTime = uniqueNewMessages[uniqueNewMessages.length - 1].createdAt;

          // Mark new messages as read if they're for current user
          let markedCount = 0;
          for (const msg of uniqueNewMessages) {
            const receiverId = typeof msg.receiver === 'object' ? msg.receiver.id : msg.receiver;
            if (receiverId === $authStore.user?.id && !msg.read) {
              await markMessageAsRead(msg.id);
              markedCount++;
            }
          }
          if (markedCount > 0) {
            unreadCountStore.decrement(markedCount);
          }

          // Clear animation after delay
          setTimeout(() => {
            for (const msg of uniqueNewMessages) {
              newMessageIds = new Set([...newMessageIds].filter(id => id !== msg.id));
            }
          }, 500);
        }

        // Update the conversation list without reloading (to maintain selection and DOM)
        updateConversationInPlace(selectedProduct.id, newMessages[newMessages.length - 1]);

        // Smart scroll to bottom
        setTimeout(scrollToBottom, 100);
      }
    } catch (err) {
      console.error('Error polling for new messages:', err);
    }
  }

  // Update a specific conversation without reloading the entire list
  function updateConversationInPlace(productId: string, latestMessage: Message) {
    const convIndex = conversations.findIndex(c => c.product.id === productId);
    if (convIndex !== -1) {
      // Update the conversation's last message
      conversations[convIndex] = {
        ...conversations[convIndex],
        lastMessage: latestMessage,
      };

      // Re-sort conversations by moving the updated one to the top
      const updatedConv = conversations[convIndex];
      conversations = [
        updatedConv,
        ...conversations.slice(0, convIndex),
        ...conversations.slice(convIndex + 1)
      ];
    }
  }

  // Start polling (fallback - only when SSE is disconnected)
  function startPolling() {
    // Don't start polling if SSE is connected
    if (sseConnected) {
      return;
    }

    // Clear existing interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    // Poll every 5 seconds as fallback when SSE is not available
    pollingInterval = setInterval(pollNewMessages, 5000);
  }

  // Stop polling
  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  // Handle typing indicator
  function handleTyping() {
    if (!selectedProduct) return;

    // Mark that I am typing
    iAmTyping = true;

    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    // Send typing status
    setTypingStatus(selectedProduct.id, true);

    // Stop typing after 2.5 seconds of no input
    typingTimeout = setTimeout(() => {
      if (selectedProduct) {
        setTypingStatus(selectedProduct.id, false);
      }
      iAmTyping = false;
    }, 2500);
  }

  // Subscribe to product SSE for typing events
  function subscribeToProductSSE(productIdStr: string) {
    // Disconnect from previous product SSE if different
    if (currentProductSseId && currentProductSseId !== productIdStr) {
      if (productSseUnsubscribe) {
        productSseUnsubscribe();
        productSseUnsubscribe = null;
      }
      disconnectProductSSE(currentProductSseId);
    }

    if (currentProductSseId === productIdStr) return; // Already subscribed

    currentProductSseId = productIdStr;
    const productSseClient = getProductSSE(productIdStr);
    productSseClient.connect();

    // Subscribe to typing events
    let typingClearTimeout: ReturnType<typeof setTimeout> | null = null;
    productSseUnsubscribe = productSseClient.subscribe((event: SSEEvent) => {
      if (event.type === 'typing') {
        const typingEvent = event as TypingEvent;
        // Only update if it's from another user
        if (String(typingEvent.userId) !== String($authStore.user?.id)) {
          // Clear any existing timeout
          if (typingClearTimeout) {
            clearTimeout(typingClearTimeout);
            typingClearTimeout = null;
          }

          if (typingEvent.isTyping) {
            // Show typing indicator immediately
            otherUserTyping = true;

            // Auto-clear typing after 4 seconds if no new update
            typingClearTimeout = setTimeout(() => {
              otherUserTyping = false;
            }, 4000);
          } else {
            // Delay hiding typing indicator by 1.5 seconds for smooth transition
            typingClearTimeout = setTimeout(() => {
              otherUserTyping = false;
            }, 1500);
          }
        }
      }
    });
  }

  // Unsubscribe from product SSE
  function unsubscribeFromProductSSE() {
    if (productSseUnsubscribe) {
      productSseUnsubscribe();
      productSseUnsubscribe = null;
    }
    if (currentProductSseId) {
      disconnectProductSSE(currentProductSseId);
      currentProductSseId = null;
    }
    otherUserTyping = false;
  }

  async function handleSendMessage() {
    if (!newMessage.trim() || !selectedProduct || !$authStore.user || !canChat) return;

    sendingMessage = true;
    error = '';

    try {
      // Determine receiver - if user is seller, send to highest bidder; if buyer, send to seller
      let receiverId: string;

      if (selectedProduct.seller?.id === $authStore.user?.id) {
        // User is seller - find highest bidder from messages
        const otherUsers = messages
          .map(m => getOtherUser(m))
          .filter((u, i, arr) => u && arr.findIndex(x => x?.id === u.id) === i);

        if (otherUsers.length > 0 && otherUsers[0]) {
          receiverId = otherUsers[0].id;
        } else {
          error = 'No buyer to message';
          sendingMessage = false;
          return;
        }
      } else {
        // User is buyer - send to seller
        receiverId = selectedProduct.seller.id;
      }

      const message = await sendMessage(selectedProduct.id, receiverId, newMessage.trim());

      if (message) {
        // Add to new message IDs for animation
        newMessageIds = new Set([...newMessageIds, message.id]);

        messages = [...messages, message];
        newMessage = '';

        // Update last message time
        lastMessageTime = message.createdAt;

        // Clear animation after delay
        setTimeout(() => {
          newMessageIds = new Set([...newMessageIds].filter(id => id !== message.id));
        }, 500);

        // Stop typing indicator
        if (selectedProduct) {
          setTypingStatus(selectedProduct.id, false);
        }
        if (typingTimeout) {
          clearTimeout(typingTimeout);
          typingTimeout = null;
        }
        iAmTyping = false;

        // Always scroll to bottom when user sends message
        shouldAutoScroll = true;
        setTimeout(scrollToBottom, 100);

        // Keep focus on input
        setTimeout(() => {
          if (chatInputElement) {
            chatInputElement.focus();
          }
        }, 50);
      } else {
        error = 'Failed to send message';
      }
    } catch (err) {
      error = 'Failed to send message';
      console.error('Error sending message:', err);
    } finally {
      sendingMessage = false;
    }
  }

  // Handle visibility change - stop polling when tab is not visible
  function handleVisibilityChange() {
    if (document.hidden) {
      // Tab is hidden, stop all polling to save resources
      stopPolling();
      stopConversationListPolling();
      // Note: SSE stays connected for typing, no need to disconnect
    } else {
      // Tab is visible again
      if (selectedProduct) {
        // Only start polling if SSE is not connected (startPolling checks this)
        startPolling();
        // Re-subscribe to product SSE for typing
        subscribeToProductSSE(String(selectedProduct.id));
      }
      // Always restart conversation list polling (this is less frequent)
      startConversationListPolling();
    }
  }

  onMount(async () => {
    if (!$authStore.isAuthenticated) {
      goto('/login?redirect=/inbox');
      return;
    }

    await loadConversations();

    // Connect to SSE for real-time message notifications
    if ($authStore.user?.id) {
      const sseClient = getUserSSE(String($authStore.user.id));
      sseClient.connect();

      // Subscribe to SSE connection state to enable/disable polling
      sseStateUnsubscribe = sseClient.state.subscribe((state) => {
        const wasConnected = sseConnected;
        sseConnected = state === 'connected';

        if (sseConnected && !wasConnected) {
          // SSE just connected - stop all polling (SSE handles updates)
          stopPolling();
          stopConversationListPolling();
        } else if (!sseConnected && wasConnected) {
          // SSE just disconnected - start polling as fallback
          if (selectedProduct) {
            startPolling();
          }
          startConversationListPolling();
        }
      });

      // Subscribe to message events
      const unsubscribe = sseClient.subscribe(async (event: SSEEvent) => {
        if (event.type === 'new_message') {
          const msgEvent = event as SSEMessageEvent;

          // If this message is for the currently selected product, add it dynamically
          if (selectedProduct && String(msgEvent.productId) === String(selectedProduct.id)) {
            // Use message data from SSE event directly (no extra HTTP request needed)
            let newMessage: Message | null = null;

            if (msgEvent.message) {
              // Use the full message data from the SSE event
              newMessage = msgEvent.message as unknown as Message;
            } else {
              // Fallback: fetch the message if not included in event
              newMessage = await fetchMessageById(msgEvent.messageId);
            }

            if (newMessage) {
              // Check if message already exists to avoid duplicates
              const messageExists = messages.some(m => m.id === newMessage!.id);

              if (!messageExists) {
                // Add to new message IDs for animation
                newMessageIds = new Set([...newMessageIds, newMessage.id]);

                // Add the new message to the list
                messages = [...messages, newMessage];
                lastMessageTime = newMessage.createdAt;

                // Mark as read if it's for current user
                const receiverId = typeof newMessage.receiver === 'object' ? newMessage.receiver.id : newMessage.receiver;
                if (receiverId === $authStore.user?.id && !newMessage.read) {
                  markMessageAsRead(newMessage.id); // Don't await - fire and forget
                  unreadCountStore.decrement(1); // Update navbar badge immediately
                }

                // Scroll to bottom for new messages
                shouldAutoScroll = true;
                await tick();
                scrollToBottom(true);

                // Clear animation after delay
                setTimeout(() => {
                  newMessageIds = new Set([...newMessageIds].filter(id => id !== newMessage!.id));
                }, 500);
              }
            }
          }

          // Update conversations list in background (without re-selecting) - debounced
          if (conversationUpdateDebounce) {
            clearTimeout(conversationUpdateDebounce);
          }
          conversationUpdateDebounce = setTimeout(() => {
            pollConversationList();
          }, 500); // Wait 500ms before updating to batch rapid messages
        }
      });

      // Store unsubscribe for cleanup
      (window as any).__sseUnsubscribe = unsubscribe;
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  // Auto-scroll when typing indicator appears (but not when I'm typing)
  $effect(() => {
    if (otherUserTyping && !iAmTyping && shouldAutoScroll) {
      setTimeout(scrollToBottom, 50);
    }
  });

  onDestroy(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    stopPolling();
    stopConversationListPolling();
    unsubscribeFromProductSSE();
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    if (conversationUpdateDebounce) {
      clearTimeout(conversationUpdateDebounce);
    }
    // Clear typing status on exit
    if (selectedProduct) {
      setTypingStatus(selectedProduct.id, false);
    }
    iAmTyping = false;
    otherUserTyping = false;

    // Unsubscribe from SSE state
    if (sseStateUnsubscribe) {
      sseStateUnsubscribe();
    }

    // Disconnect from user SSE
    if ($authStore.user?.id) {
      disconnectUserSSE(String($authStore.user.id));
    }
    if ((window as any).__sseUnsubscribe) {
      (window as any).__sseUnsubscribe();
    }
  });
</script>

<svelte:head>
  <title>Inbox - BidMo.to</title>
</svelte:head>

<div class="inbox-page">
  <h1>Inbox</h1>

  {#if loading}
    <div class="loading">Loading conversations...</div>
  {:else if conversations.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📬</div>
      <h2>No Messages Yet</h2>
      <p>Your conversations with buyers and sellers will appear here.</p>
      <a href="/products" class="btn-browse">Browse Products</a>
    </div>
  {:else}
    <div class="inbox-container">
      <!-- Conversations List -->
      <aside class="conversations-list" class:hide-on-mobile={selectedProduct}>
        <div class="tabs">
          <button
            class="tab"
            class:active={activeTab === 'products'}
            onclick={() => activeTab = 'products'}
          >
            My Products
            {#if myProductsConversations.length > 0}
              <span class="tab-badge">{myProductsConversations.length}</span>
            {/if}
          </button>
          <button
            class="tab"
            class:active={activeTab === 'purchases'}
            onclick={() => activeTab = 'purchases'}
          >
            My Purchases
            {#if myPurchasesConversations.length > 0}
              <span class="tab-badge">{myPurchasesConversations.length}</span>
            {/if}
          </button>
        </div>

        {#if displayedConversations.length === 0}
          <div class="no-conversations">
            <p>No conversations yet</p>
          </div>
        {/if}

        {#each displayedConversations as conv (conv.product.id)}
          {@const isMyProduct = conv.product.seller?.id === $authStore.user?.id}
          {@const otherUserInConv = getOtherUser(conv.lastMessage)}
          <button
            class="conversation-item"
            class:active={selectedProduct?.id === conv.product.id}
            class:loading={loadingConversation && selectedProduct?.id === conv.product.id}
            onclick={() => selectConversation(conv.product)}
            disabled={loadingConversation}
          >
            <div class="conversation-image">
              {#if conv.product.images && conv.product.images.length > 0 && conv.product.images[0].image}
                <img src={conv.product.images[0].image.url} alt={conv.product.title} />
              {:else}
                <div class="no-image">📦</div>
              {/if}
            </div>

            <div class="conversation-info">
              <h3>{conv.product.title}</h3>
              <p class="seller-name">
                {#if isMyProduct}
                  Buyer: {otherUserInConv?.name || 'Unknown'}
                {:else}
                  Seller: {conv.product.seller?.name || 'Unknown'}
                {/if}
              </p>
              <p class="last-message">
                {#if conv.lastMessage}
                  {@const senderId = typeof conv.lastMessage.sender === 'object' ? conv.lastMessage.sender.id : conv.lastMessage.sender}
                  {@const isMine = $authStore.user?.id === senderId}
                  {#if isMine}
                    <span class="sender-name">Me:</span>
                  {:else}
                    {#if otherUserInConv}
                      <span class="sender-name">{otherUserInConv.name}:</span>
                    {/if}
                  {/if}
                  {conv.lastMessage.message.substring(0, 50)}{conv.lastMessage.message.length > 50 ? '...' : ''}
                {:else}
                  No messages yet
                {/if}
              </p>
              <span class="timestamp">{formatDate(conv.lastMessage.createdAt)}</span>
            </div>

            {#if conv.unreadCount > 0}
              <span class="unread-badge">{conv.unreadCount}</span>
            {/if}
          </button>
        {/each}
      </aside>

      <!-- Chat Area -->
      <main class="chat-area" class:show-on-mobile={selectedProduct}>
        {#if selectedProduct}
          <div class="chat-header">
            <button class="back-btn" onclick={handleBackToList} disabled={loadingConversation}>
              ← Back
            </button>
            <div class="product-summary">
              <h3>{selectedProduct.title}</h3>
              <p class="product-price">
                {formatPrice(selectedProduct.currentBid || selectedProduct.startingPrice, selectedProduct.seller.currency)}
                •
                <span class="status-badge status-{selectedProduct.status}">{selectedProduct.status}</span>
              </p>
              <div class="transaction-parties">
                <div class="party-info">
                  <span class="party-label">Seller:</span>
                  <a href="/users/{selectedProduct.seller.id}" class="party-name">{sellerName || selectedProduct.seller?.name || 'Unknown'}</a>
                </div>
                {#if buyerName || (selectedProduct.status === 'sold' && transaction)}
                  <div class="party-info">
                    <span class="party-label">Buyer:</span>
                    {#if transaction && typeof transaction.buyer === 'object' && transaction.buyer}
                      <a href="/users/{transaction.buyer.id}" class="party-name">{buyerName || 'Unknown'}</a>
                    {:else}
                      <span class="party-name">{buyerName || 'Unknown'}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
            <KebabMenu
              items={[
                { label: 'View Product', action: 'view_product', show: true, icon: '🔗' },
                { label: 'Void Bid', action: 'void_bid', show: selectedProduct.status === 'sold' && !!transaction && (transaction.status === 'pending' || transaction.status === 'in_progress'), variant: 'danger', icon: '❌' }
              ]}
              onSelect={(detail) => handleMenuAction(detail.action)}
            />
          </div>

          <div class="chat-messages" bind:this={chatMessagesElement} onscroll={handleScroll}>
            {#if loadingConversation}
              <div class="loading-conversation">
                <div class="loading-spinner"></div>
                <span>Loading conversation...</span>
              </div>
            {:else}
              {#if loadingOlderMessages}
                <div class="loading-older">
                  <div class="loading-spinner"></div>
                  <span>Loading older messages...</span>
                </div>
              {/if}

              {#each messages as message (message.id)}
              {@const isMine = $authStore.user?.id === (typeof message.sender === 'object' ? message.sender.id : message.sender)}
              {@const sender = typeof message.sender === 'object' ? message.sender : null}
              {@const isNew = newMessageIds.has(message.id)}

              <div class="message" class:mine={isMine} class:new-message={isNew}>
                <div class="message-content">
                  {#if !isMine && sender}
                    <span class="message-sender">{sender.name}</span>
                  {/if}
                  <p>{message.message}</p>
                  <span class="message-time">{formatDate(message.createdAt)}</span>
                </div>
              </div>
            {/each}

              {#if otherUserTyping && !iAmTyping}
                <div class="typing-indicator">
                  <div class="typing-dots">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                  </div>
                  <span class="typing-text">typing...</span>
                </div>
              {/if}
            {/if}
          </div>

          {#if error}
            <div class="error-message">{error}</div>
          {/if}

          <!-- Inline Rating Section -->
          {#if selectedProduct.status === 'sold' && transaction}
            <div class="inline-rating-section">
              {#if !myRating}
                <div class="rating-prompt">
                  <div class="rating-prompt-header">
                    <span class="rating-icon">⭐</span>
                    <span class="rating-title">Rate this transaction</span>
                  </div>
                  <p class="rating-prompt-text">
                    How was your experience with {$authStore.user?.id === selectedProduct.seller.id ? (buyerName || 'the buyer') : (sellerName || 'the seller')} for this order?
                  </p>
                  <div class="inline-rating-form">
                    <div class="inline-star-selector">
                      <StarRating
                        rating={ratingValue}
                        interactive={true}
                        size="medium"
                        onChange={(detail) => ratingValue = detail.rating}
                      />
                      {#if ratingValue > 0}
                        <span class="rating-value-text">{ratingValue}/5</span>
                      {/if}
                    </div>
                    {#if ratingValue > 0}
                      <div class="inline-comment-row">
                        <input
                          type="text"
                          bind:value={ratingComment}
                          placeholder="Add a comment (optional)"
                          class="inline-comment-input"
                        />
                        <button
                          class="inline-submit-btn"
                          onclick={submitRating}
                          disabled={submittingRating}
                        >
                          {submittingRating ? '...' : 'Submit'}
                        </button>
                      </div>
                    {/if}
                  </div>
                  {#if ratingError}
                    <div class="inline-rating-error">{ratingError}</div>
                  {/if}
                </div>
              {:else}
                <div class="rating-submitted-inline">
                  <div class="rating-submitted-header">
                    <span class="rating-check">✓</span>
                    <span>You rated {$authStore.user?.id === selectedProduct.seller.id ? (buyerName || 'the buyer') : (sellerName || 'the seller')}</span>
                  </div>
                  <div class="rating-submitted-content">
                    <StarRating rating={myRating.rating} size="small" />
                    <span class="rating-score">{myRating.rating}/5</span>
                    {#if myRating.comment}
                      <span class="rating-comment-text">"{myRating.comment}"</span>
                    {/if}
                  </div>
                  {#if otherPartyRating}
                    <div class="other-party-rating">
                      <span class="other-rating-label">
                        {$authStore.user?.id === selectedProduct.seller.id ? (buyerName || 'Buyer') : (sellerName || 'Seller')} rated you:
                      </span>
                      <StarRating rating={otherPartyRating.rating} size="small" />
                      <span class="rating-score">{otherPartyRating.rating}/5</span>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          {#if !canChat}
            <div class="chat-blocked-message">
              <div class="blocked-icon">🔒</div>
              <p class="blocked-text">{chatBlockedReason}</p>
              <a href="/products/{selectedProduct.id}?from=inbox" class="view-product-btn">
                View Product Page
              </a>
            </div>
          {:else}
            <form class="chat-input-form" onsubmit={(e) => { e.preventDefault(); handleSendMessage(); }}>
              <input
                type="text"
                bind:value={newMessage}
                bind:this={chatInputElement}
                oninput={handleTyping}
                placeholder="Type your message..."
                class="chat-input"
                disabled={sendingMessage}
              />
              <button type="submit" class="send-btn" disabled={sendingMessage || !newMessage.trim()}>
                {sendingMessage ? 'Sending...' : 'Send'}
              </button>
            </form>
          {/if}
        {:else}
          <div class="no-conversation-selected">
            <p>Select a conversation to start messaging</p>
          </div>
        {/if}
      </main>
    </div>
  {/if}
</div>

<!-- Rating Modal -->
{#if showRatingModal && selectedProduct && transaction}
  <div class="modal-overlay" onclick={() => showRatingModal = false} onkeydown={(e) => e.key === 'Escape' && (showRatingModal = false)} role="button" tabindex="0">
    <div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <button class="modal-close" onclick={() => showRatingModal = false}>&times;</button>
      <h2>Rate Your {$authStore.user?.id === selectedProduct.seller.id ? 'Buyer' : 'Seller'}</h2>
      <p class="modal-subtitle">
        {#if $authStore.user?.id === selectedProduct.seller.id}
          How was your experience with {buyerName || 'the buyer'}?
        {:else}
          How was your experience with {sellerName || 'the seller'}?
        {/if}
      </p>

      <div class="rating-selector">
        <StarRating
          rating={ratingValue}
          interactive={true}
          size="large"
          onChange={(detail) => ratingValue = detail.rating}
        />
        <span class="rating-value-display">{ratingValue > 0 ? `${ratingValue}/5` : 'Select rating'}</span>
      </div>

      <div class="comment-input">
        <label for="rating-comment">Comment (optional)</label>
        <textarea
          id="rating-comment"
          bind:value={ratingComment}
          placeholder="Share your experience..."
          rows="3"
        ></textarea>
      </div>

      {#if ratingError}
        <div class="rating-error">{ratingError}</div>
      {/if}

      <div class="modal-actions">
        <button class="btn-cancel" onclick={() => showRatingModal = false}>Cancel</button>
        <button
          class="btn-submit"
          onclick={submitRating}
          disabled={submittingRating || ratingValue === 0}
        >
          {submittingRating ? 'Submitting...' : 'Submit Rating'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Void Request Modal -->
{#if showVoidModal}
  <div class="modal-overlay" onclick={closeVoidModal}>
    <div class="modal void-modal" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={closeVoidModal}>&times;</button>
      <h2>Request Void</h2>
      <p class="void-description">
        You are requesting to void the transaction for <strong>{selectedProduct?.title}</strong>.
        The other party will need to approve this request.
      </p>

      <div class="form-group">
        <label for="voidReason">Reason for void request <span class="required">*</span></label>
        <textarea
          id="voidReason"
          bind:value={voidReason}
          placeholder="Please explain why you want to void this transaction..."
          rows="4"
        ></textarea>
      </div>

      {#if voidError}
        <div class="void-error">{voidError}</div>
      {/if}

      <div class="modal-actions">
        <button class="btn-cancel" onclick={closeVoidModal}>Cancel</button>
        <button
          class="btn-submit btn-danger"
          onclick={handleSubmitVoidRequest}
          disabled={submittingVoid || !voidReason.trim()}
        >
          {submittingVoid ? 'Submitting...' : 'Submit Void Request'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Void Approval Modal -->
{#if showVoidApprovalModal && pendingVoidRequest}
  <div class="modal-overlay" onclick={closeVoidApprovalModal}>
    <div class="modal void-modal" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={closeVoidApprovalModal}>&times;</button>
      <h2>Void Request</h2>
      <p class="void-description">
        <strong>{typeof pendingVoidRequest.initiator === 'object' ? pendingVoidRequest.initiator.name : 'User'}</strong>
        has requested to void the transaction for <strong>{selectedProduct?.title}</strong>.
      </p>

      <div class="void-reason-display">
        <label>Their reason:</label>
        <p>{pendingVoidRequest.reason}</p>
      </div>

      <div class="form-group rejection-reason" style="display: none;" id="rejectionReasonGroup">
        <label for="voidRejectionReason">Reason for rejection <span class="required">*</span></label>
        <textarea
          id="voidRejectionReason"
          bind:value={voidRejectionReason}
          placeholder="Please explain why you are rejecting this void request..."
          rows="3"
        ></textarea>
      </div>

      {#if voidError}
        <div class="void-error">{voidError}</div>
      {/if}

      <div class="modal-actions three-buttons">
        <button class="btn-cancel" onclick={closeVoidApprovalModal}>Cancel</button>
        <button
          class="btn-reject"
          onclick={() => {
            const group = document.getElementById('rejectionReasonGroup');
            if (group && group.style.display === 'none') {
              group.style.display = 'block';
            } else {
              handleRespondToVoid('reject');
            }
          }}
          disabled={submittingVoid}
        >
          {submittingVoid ? 'Processing...' : 'Reject'}
        </button>
        <button
          class="btn-submit btn-success"
          onclick={() => handleRespondToVoid('approve')}
          disabled={submittingVoid}
        >
          {submittingVoid ? 'Processing...' : 'Approve Void'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Seller Choice Modal -->
{#if showSellerChoiceModal}
  <div class="modal-overlay" onclick={() => showSellerChoiceModal = false}>
    <div class="modal void-modal seller-choice-modal" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={() => showSellerChoiceModal = false}>&times;</button>
      <h2>Transaction Voided</h2>
      <p class="void-description">
        The void request for <strong>{selectedProduct?.title}</strong> has been approved.
        As the seller, please choose what to do next:
      </p>

      <div class="choice-options">
        <button
          class="choice-option"
          onclick={() => handleSellerChoice('restart_bidding')}
          disabled={submittingVoid}
        >
          <div class="choice-icon">🔄</div>
          <div class="choice-content">
            <h3>Restart Bidding</h3>
            <p>Reopen the auction and let all bidders participate again</p>
          </div>
        </button>

        <button
          class="choice-option"
          onclick={() => handleSellerChoice('offer_second_bidder')}
          disabled={submittingVoid}
        >
          <div class="choice-icon">🥈</div>
          <div class="choice-content">
            <h3>Offer to 2nd Highest Bidder</h3>
            <p>Give the second highest bidder a chance to purchase at their bid amount</p>
          </div>
        </button>
      </div>

      {#if voidError}
        <div class="void-error">{voidError}</div>
      {/if}
    </div>
  </div>
{/if}

<!-- Second Bidder Offer Modal -->
{#if showSecondBidderOfferModal && pendingVoidRequest?.secondBidderOffer}
  <div class="modal-overlay" onclick={() => showSecondBidderOfferModal = false}>
    <div class="modal void-modal" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={() => showSecondBidderOfferModal = false}>&times;</button>
      <h2>Purchase Offer</h2>
      <p class="void-description">
        You have been offered the chance to purchase <strong>{selectedProduct?.title}</strong>
        as the second highest bidder!
      </p>

      <div class="offer-details">
        <div class="offer-amount">
          <label>Your bid amount:</label>
          <span class="amount">{formatPrice(pendingVoidRequest.secondBidderOffer.offerAmount, selectedProduct?.seller?.currency || 'PHP')}</span>
        </div>
        <p class="offer-note">
          The original winner has voided their purchase. Would you like to buy this item at your bid amount?
        </p>
      </div>

      {#if voidError}
        <div class="void-error">{voidError}</div>
      {/if}

      <div class="modal-actions">
        <button
          class="btn-cancel"
          onclick={() => handleSecondBidderResponse('decline')}
          disabled={submittingVoid}
        >
          {submittingVoid ? 'Processing...' : 'Decline'}
        </button>
        <button
          class="btn-submit btn-success"
          onclick={() => handleSecondBidderResponse('accept')}
          disabled={submittingVoid}
        >
          {submittingVoid ? 'Processing...' : 'Accept Offer'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .inbox-page {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem 0;
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 2rem;
    color: var(--color-fg);
  }

  .loading {
    text-align: center;
    padding: 3rem;
    color: var(--color-fg);
    opacity: 0.7;
    font-size: 1.2rem;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    background-color: var(--color-muted);
    box-shadow: var(--shadow-bh-md);
  }

  .empty-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .empty-state h2 {
    font-size: 1.8rem;
    color: var(--color-fg);
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    color: var(--color-fg);
    opacity: 0.7;
    font-size: 1.1rem;
    margin-bottom: 2rem;
  }

  .btn-browse {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: var(--color-red);
    color: var(--color-white);
    text-decoration: none;
    font-weight: 600;
    border: var(--border-bh) solid var(--color-red);
    box-shadow: var(--shadow-bh-sm);
    transition: opacity 0.2s, box-shadow 0.2s;
  }

  .btn-browse:hover {
    opacity: 0.9;
    box-shadow: var(--shadow-bh-md);
  }

  .inbox-container {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 1.5rem;
    height: calc(100vh - 250px);
    min-height: 600px;
  }

  .conversations-list {
    background: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    border-bottom: var(--border-bh) solid var(--color-border);
    margin-bottom: 1rem;
  }

  .tab {
    flex: 1;
    padding: 0.75rem 1rem;
    background: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--color-fg);
    opacity: 0.7;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .tab:hover {
    background: var(--color-muted);
    border-color: var(--color-fg);
  }

  .tab.active {
    background: var(--color-red);
    border-color: var(--color-red);
    color: var(--color-white);
    opacity: 1;
  }

  .tab-badge {
    background: rgba(255, 255, 255, 0.3);
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .tab.active .tab-badge {
    background: rgba(255, 255, 255, 0.9);
    color: var(--color-red);
  }

  .no-conversations {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--color-fg);
    opacity: 0.6;
    font-size: 0.95rem;
  }

  .conversation-item {
    width: 100%;
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    border: var(--border-bh) solid var(--color-border);
    background: var(--color-white);
    box-shadow: var(--shadow-bh-sm);
    cursor: pointer;
    transition: background-color 0.2s;
    margin-bottom: 0.5rem;
    text-align: left;
    position: relative;
  }

  .conversation-item:hover {
    background-color: var(--color-muted);
  }

  .conversation-item.active {
    background-color: var(--color-muted);
    border-left: 4px solid var(--color-red);
  }

  .conversation-item.loading {
    opacity: 0.6;
    pointer-events: none;
  }

  .conversation-item:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .conversation-image {
    width: 60px;
    height: 60px;
    flex-shrink: 0;
    overflow: hidden;
    background-color: var(--color-muted);
  }

  .conversation-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .no-image {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
  }

  .conversation-info {
    flex: 1;
    min-width: 0;
  }

  .conversation-info h3 {
    font-size: 0.95rem;
    margin: 0 0 0.25rem 0;
    color: var(--color-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seller-name {
    font-size: 0.8rem;
    color: var(--color-fg);
    opacity: 0.6;
    margin: 0 0 0.35rem 0;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .last-message {
    font-size: 0.85rem;
    color: var(--color-fg);
    opacity: 0.7;
    margin: 0 0 0.25rem 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sender-name {
    font-weight: 600;
    color: var(--color-fg);
  }

  .timestamp {
    font-size: 0.75rem;
    color: var(--color-fg);
    opacity: 0.6;
  }

  .unread-badge {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background-color: var(--color-yellow);
    color: var(--color-fg);
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .chat-area {
    background: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .chat-header {
    padding: 1.25rem;
    border-bottom: var(--border-bh) solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .product-summary h3 {
    font-size: 1.25rem;
    margin: 0 0 0.25rem 0;
    color: var(--color-fg);
  }

  .product-price {
    margin: 0;
    font-size: 0.95rem;
    color: var(--color-fg);
    opacity: 0.7;
  }

  .status-badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .status-active {
    background-color: var(--color-blue);
    color: var(--color-white);
  }

  .status-sold {
    background-color: var(--color-blue);
    color: var(--color-white);
  }

  .status-ended {
    background-color: var(--color-fg);
    color: var(--color-white);
  }

  .view-product-link {
    color: var(--color-red);
    text-decoration: none;
    font-weight: 600;
    transition: opacity 0.2s;
  }

  .view-product-link:hover {
    opacity: 0.7;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .message {
    display: flex;
    justify-content: flex-start;
  }

  .message.mine {
    justify-content: flex-end;
  }

  .message-content {
    max-width: 60%;
    background-color: var(--color-muted);
    padding: 0.75rem 1rem;
  }

  .message.mine .message-content {
    background: var(--color-blue);
    color: white;
  }

  .message-sender {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: var(--color-fg);
    opacity: 0.7;
  }

  .message.mine .message-sender {
    color: rgba(255, 255, 255, 0.9);
  }

  .message-content p {
    margin: 0;
    line-height: 1.5;
  }

  .message-time {
    display: block;
    font-size: 0.7rem;
    margin-top: 0.25rem;
    opacity: 0.7;
  }

  /* New message float-up animation */
  .message.new-message {
    animation: floatUp 0.4s ease-out;
  }

  @keyframes floatUp {
    0% {
      opacity: 0;
      transform: translateY(20px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .error-message {
    padding: 0.75rem 1.25rem;
    background-color: var(--color-muted);
    color: var(--color-red);
    text-align: center;
    border-top: var(--border-bh) solid var(--color-border);
  }

  .chat-input-form {
    display: flex;
    gap: 0.75rem;
    padding: 1.25rem;
    border-top: var(--border-bh) solid var(--color-border);
  }

  .chat-input {
    flex: 1;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    border: var(--border-bh) solid var(--color-border);
    font-family: inherit;
  }

  .chat-input:focus {
    outline: none;
    border-color: var(--color-fg);
    box-shadow: var(--shadow-bh-sm);
  }

  .send-btn {
    padding: 0.75rem 2rem;
    background: var(--color-red);
    color: var(--color-white);
    border: var(--border-bh) solid var(--color-red);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    box-shadow: var(--shadow-bh-sm);
    transition: opacity 0.2s, box-shadow 0.2s;
  }

  .send-btn:hover:not(:disabled) {
    opacity: 0.9;
    box-shadow: var(--shadow-bh-md);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .no-conversation-selected {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-fg);
    opacity: 0.6;
    font-size: 1.1rem;
  }

  /* Typing Indicator */
  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
  }

  .typing-dots {
    display: flex;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    background-color: var(--color-muted);
  }

  .dot {
    width: 8px;
    height: 8px;
    background-color: var(--color-fg);
    opacity: 0.5;
    border-radius: 50%;
    animation: typing 1.4s infinite;
  }

  .dot:nth-child(1) {
    animation-delay: 0s;
  }

  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes typing {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.5;
    }
    30% {
      transform: translateY(-10px);
      opacity: 1;
    }
  }

  .typing-text {
    font-size: 0.85rem;
    color: var(--color-fg);
    opacity: 0.6;
    font-style: italic;
  }

  /* Loading Older Messages */
  .loading-older {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem;
    color: var(--color-fg);
    opacity: 0.7;
    font-size: 0.9rem;
  }

  /* Loading Conversation */
  .loading-conversation {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem 1rem;
    color: var(--color-fg);
    opacity: 0.7;
    font-size: 1rem;
    min-height: 200px;
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-red);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-conversation .loading-spinner {
    width: 30px;
    height: 30px;
    border-width: 4px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Chat Blocked Message */
  .chat-blocked-message {
    padding: 2rem;
    text-align: center;
    background: var(--color-muted);
    border-top: var(--border-bh) solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .blocked-icon {
    font-size: 3rem;
  }

  .blocked-text {
    font-size: 1rem;
    color: var(--color-red);
    margin: 0;
    font-weight: 500;
  }

  .view-product-btn {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: var(--color-red);
    color: var(--color-white);
    text-decoration: none;
    font-weight: 600;
    border: var(--border-bh) solid var(--color-red);
    box-shadow: var(--shadow-bh-sm);
    transition: opacity 0.2s, box-shadow 0.2s;
    margin-top: 0.5rem;
  }

  .view-product-btn:hover {
    opacity: 0.9;
    box-shadow: var(--shadow-bh-md);
  }

  /* Back button - hidden by default, shown on mobile */
  .back-btn {
    display: none;
    padding: 0.5rem 1rem;
    background: var(--color-white);
    color: var(--color-red);
    border: var(--border-bh) solid var(--color-red);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .back-btn:hover:not(:disabled) {
    background: var(--color-red);
    color: var(--color-white);
  }

  .back-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .inbox-page {
      padding: 1rem 0;
    }

    h1 {
      font-size: 1.8rem;
      margin-bottom: 1rem;
    }

    .inbox-container {
      grid-template-columns: 1fr;
      gap: 0;
      height: calc(100vh - 180px);
    }

    /* Hide conversations list when chat is selected on mobile */
    .conversations-list.hide-on-mobile {
      display: none;
    }

    .chat-area {
      display: none;
    }

    .chat-area.show-on-mobile {
      display: flex;
    }

    /* Show back button on mobile */
    .back-btn {
      display: block;
    }

    .chat-header {
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .product-summary {
      flex: 1;
      min-width: 100%;
      order: 2;
    }

    .back-btn {
      order: 1;
    }

    .view-product-link {
      order: 3;
      width: 100%;
      text-align: center;
    }

    .message-content {
      max-width: 80%;
    }

    .tabs {
      flex-direction: column;
    }

    .tab {
      width: 100%;
    }
  }

  /* Transaction Parties */
  .transaction-parties {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .party-info {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.85rem;
  }

  .party-label {
    color: var(--color-fg);
    opacity: 0.7;
  }

  .party-name {
    color: var(--color-fg);
    font-weight: 500;
    text-decoration: none;
  }

  .party-name:hover {
    color: var(--color-red);
    text-decoration: underline;
  }

  .my-rating-badge,
  .other-rating-badge {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  /* Submit Rating Button */
  .submit-rating-btn {
    margin-top: 0.75rem;
    padding: 0.5rem 1rem;
    background: var(--color-blue);
    color: var(--color-white);
    border: var(--border-bh) solid var(--color-blue);
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    box-shadow: var(--shadow-bh-sm);
    transition: opacity 0.2s, box-shadow 0.2s;
  }

  .submit-rating-btn:hover {
    opacity: 0.9;
    box-shadow: var(--shadow-bh-md);
  }

  /* Rating Submitted */
  .rating-submitted {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: var(--color-muted);
    font-size: 0.85rem;
  }

  .rating-label {
    color: var(--color-blue);
    font-weight: 500;
  }

  .rating-comment {
    font-style: italic;
    color: var(--color-fg);
    opacity: 0.7;
    font-size: 0.8rem;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: var(--color-white);
    padding: 2rem;
    max-width: 450px;
    width: 100%;
    position: relative;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-md);
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--color-fg);
    opacity: 0.6;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.2s;
  }

  .modal-close:hover {
    background: var(--color-muted);
    opacity: 1;
  }

  .modal-content h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    color: var(--color-fg);
  }

  .modal-subtitle {
    color: var(--color-fg);
    opacity: 0.7;
    margin: 0 0 1.5rem 0;
    font-size: 0.95rem;
  }

  .rating-selector {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .rating-value-display {
    font-size: 0.9rem;
    color: var(--color-fg);
    opacity: 0.7;
    font-weight: 500;
  }

  .comment-input {
    margin-bottom: 1.5rem;
  }

  .comment-input label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: var(--color-fg);
  }

  .comment-input textarea {
    width: 100%;
    padding: 0.75rem;
    border: var(--border-bh) solid var(--color-border);
    font-family: inherit;
    font-size: 0.95rem;
    resize: vertical;
    min-height: 80px;
  }

  .comment-input textarea:focus {
    outline: none;
    border-color: var(--color-fg);
    box-shadow: var(--shadow-bh-sm);
  }

  .rating-error {
    color: var(--color-red);
    font-size: 0.9rem;
    margin-bottom: 1rem;
    text-align: center;
  }

  .modal-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .btn-cancel {
    padding: 0.75rem 1.5rem;
    background: var(--color-white);
    color: var(--color-fg);
    opacity: 0.7;
    border: var(--border-bh) solid var(--color-border);
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cancel:hover {
    background: var(--color-muted);
    border-color: var(--color-fg);
    opacity: 1;
  }

  .btn-submit {
    padding: 0.75rem 1.5rem;
    background: var(--color-red);
    color: var(--color-white);
    border: var(--border-bh) solid var(--color-red);
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    box-shadow: var(--shadow-bh-sm);
    transition: opacity 0.2s, box-shadow 0.2s;
  }

  .btn-submit:hover:not(:disabled) {
    opacity: 0.9;
    box-shadow: var(--shadow-bh-md);
  }

  .btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Inline Rating Section */
  .inline-rating-section {
    border-top: var(--border-bh) solid var(--color-border);
    padding: 1rem 1.25rem;
    background: var(--color-yellow);
  }

  .rating-prompt {
    text-align: center;
  }

  .rating-prompt-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .rating-icon {
    font-size: 1.25rem;
  }

  .rating-title {
    font-weight: 600;
    font-size: 1rem;
    color: var(--color-fg);
  }

  .rating-prompt-text {
    margin: 0 0 0.75rem 0;
    font-size: 0.85rem;
    color: var(--color-fg);
    opacity: 0.8;
  }

  .inline-rating-form {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .inline-star-selector {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .rating-value-text {
    font-weight: 600;
    color: var(--color-fg);
    font-size: 0.9rem;
  }

  .inline-comment-row {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    max-width: 400px;
  }

  .inline-comment-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: var(--border-bh) solid var(--color-border);
    font-size: 0.9rem;
    font-family: inherit;
    background: var(--color-white);
  }

  .inline-comment-input:focus {
    outline: none;
    border-color: var(--color-fg);
    box-shadow: var(--shadow-bh-sm);
  }

  .inline-submit-btn {
    padding: 0.5rem 1rem;
    background: var(--color-red);
    color: var(--color-white);
    border: var(--border-bh) solid var(--color-red);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    box-shadow: var(--shadow-bh-sm);
    transition: opacity 0.2s, box-shadow 0.2s;
    white-space: nowrap;
  }

  .inline-submit-btn:hover:not(:disabled) {
    opacity: 0.9;
    box-shadow: var(--shadow-bh-md);
  }

  .inline-submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .inline-rating-error {
    color: var(--color-red);
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }

  /* Rating Submitted Inline */
  .rating-submitted-inline {
    background: var(--color-muted);
    border: var(--border-bh) solid var(--color-border);
    padding: 0.75rem 1rem;
  }

  .rating-submitted-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: var(--color-blue);
    font-size: 0.9rem;
  }

  .rating-check {
    color: var(--color-blue);
    font-size: 1.1rem;
  }

  .rating-submitted-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .rating-score {
    font-weight: 600;
    color: var(--color-fg);
    font-size: 0.85rem;
  }

  .rating-comment-text {
    font-style: italic;
    color: var(--color-fg);
    opacity: 0.7;
    font-size: 0.85rem;
  }

  .other-party-rating {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border);
    flex-wrap: wrap;
  }

  .other-rating-label {
    font-size: 0.8rem;
    color: var(--color-blue);
  }

  /* Mobile responsive for new elements */
  @media (max-width: 768px) {
    .transaction-parties {
      flex-direction: column;
      gap: 0.5rem;
    }

    .rating-submitted {
      flex-wrap: wrap;
    }

    .rating-comment {
      max-width: 100%;
      width: 100%;
    }

    .modal-content {
      padding: 1.5rem;
    }

    .modal-actions {
      flex-direction: column-reverse;
    }

    .btn-cancel,
    .btn-submit {
      width: 100%;
    }

    .inline-rating-section {
      padding: 0.75rem 1rem;
    }

    .inline-comment-row {
      flex-direction: column;
    }

    .inline-submit-btn {
      width: 100%;
    }

    .rating-submitted-content {
      flex-direction: column;
      align-items: flex-start;
    }

    .other-party-rating {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  /* Base Modal Styles */
  .modal {
    background: var(--color-white);
    padding: 2rem;
    max-width: 450px;
    width: 90%;
    position: relative;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-md);
  }

  .modal h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    color: var(--color-fg);
  }

  /* Void Modal Styles */
  .void-modal {
    max-width: 480px;
  }

  .void-modal .form-group {
    margin-bottom: 1.5rem;
  }

  .void-modal .form-group label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: var(--color-fg);
  }

  .void-modal .form-group .required {
    color: var(--color-red);
  }

  .void-modal .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    border: var(--border-bh) solid var(--color-border);
    font-size: 0.95rem;
    resize: vertical;
    min-height: 100px;
    font-family: inherit;
  }

  .void-modal .form-group textarea:focus {
    outline: none;
    border-color: var(--color-fg);
    box-shadow: var(--shadow-bh-sm);
  }

  .void-description {
    color: var(--color-fg);
    opacity: 0.7;
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }

  .void-error {
    background: var(--color-muted);
    color: var(--color-red);
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .void-reason-display {
    background: var(--color-muted);
    padding: 1rem;
    border: var(--border-bh) solid var(--color-border);
    margin-bottom: 1.5rem;
  }

  .void-reason-display label {
    font-size: 0.85rem;
    color: var(--color-fg);
    opacity: 0.7;
    margin-bottom: 0.5rem;
    display: block;
  }

  .void-reason-display p {
    color: var(--color-fg);
    line-height: 1.5;
    margin: 0;
  }

  .btn-danger {
    background: var(--color-red);
    border-color: var(--color-red);
  }

  .btn-danger:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-success {
    background: var(--color-blue);
    border-color: var(--color-blue);
  }

  .btn-success:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-reject {
    background: var(--color-yellow);
    color: var(--color-fg);
    border: var(--border-bh) solid var(--color-yellow);
    padding: 0.75rem 1.5rem;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
    transition: opacity 0.2s;
  }

  .btn-reject:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-reject:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-actions.three-buttons {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  /* Seller Choice Modal */
  .seller-choice-modal {
    max-width: 520px;
  }

  .choice-options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .choice-option {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem;
    background: var(--color-muted);
    border: 2px solid var(--color-border);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    width: 100%;
  }

  .choice-option:hover:not(:disabled) {
    border-color: var(--color-red);
    background: var(--color-bg);
  }

  .choice-option:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .choice-icon {
    font-size: 2rem;
    flex-shrink: 0;
  }

  .choice-content h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: var(--color-fg);
  }

  .choice-content p {
    margin: 0;
    color: var(--color-fg);
    opacity: 0.7;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  /* Second Bidder Offer Modal */
  .offer-details {
    background: var(--color-yellow);
    padding: 1.25rem;
    border: 2px solid var(--color-border);
    margin-bottom: 1.5rem;
  }

  .offer-amount {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .offer-amount label {
    color: var(--color-fg);
    opacity: 0.8;
    font-size: 0.9rem;
  }

  .offer-amount .amount {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-fg);
  }

  .offer-note {
    color: var(--color-fg);
    opacity: 0.8;
    font-size: 0.9rem;
    line-height: 1.5;
    margin: 0;
  }

  @media (max-width: 768px) {
    .modal-actions.three-buttons {
      flex-direction: column-reverse;
    }

    .modal-actions.three-buttons button {
      width: 100%;
    }

    .choice-option {
      flex-direction: column;
      text-align: center;
    }
  }
</style>
