<script lang="ts">
  export let params: any = undefined; // SvelteKit passes this automatically
  import { onMount, onDestroy, tick } from 'svelte';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import { unreadCountStore } from '$lib/stores/inbox';
  import { fetchConversations, fetchProductMessages, fetchMessageById, fetchProduct, fetchProductBids, sendMessage, markMessageAsRead, setTypingStatus } from '$lib/api';
  import type { Product, Message } from '$lib/api';
  import { goto } from '$app/navigation';
  import { getUserSSE, disconnectUserSSE, getProductSSE, disconnectProductSSE, type SSEEvent, type MessageEvent as SSEMessageEvent, type TypingEvent } from '$lib/sse';

  function handleBackToList() {
    selectedProduct = null;
    // Clear URL parameter
    goto('/inbox', { replaceState: true });
  }

  let conversations: { product: Product; lastMessage: Message; unreadCount: number }[] = [];
  let selectedProduct: Product | null = null;
  let messages: Message[] = [];
  let newMessage = '';
  let loading = true;
  let loadingConversation = false;
  let sendingMessage = false;
  let error = '';
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let conversationListPollingInterval: ReturnType<typeof setInterval> | null = null;
  let lastMessageTime: string | null = null;
  let chatInputElement: HTMLInputElement;
  let typingTimeout: ReturnType<typeof setTimeout> | null = null;
  let productSseUnsubscribe: (() => void) | null = null;
  let currentProductSseId: string | null = null;
  let otherUserTyping = false;
  let iAmTyping = false;
  let activeTab: 'products' | 'purchases' = 'products';
  let chatMessagesElement: HTMLElement | null = null;
  let shouldAutoScroll = true;
  let loadingOlderMessages = false;
  let hasMoreMessages = true;
  const MESSAGE_PAGE_SIZE = 10;
  let canChat = true;
  let chatBlockedReason = '';
  let newMessageIds: Set<string> = new Set();
  let conversationUpdateDebounce: ReturnType<typeof setTimeout> | null = null;
  let sseConnected = false;
  let sseStateUnsubscribe: (() => void) | null = null;

  // Get product ID from query params if navigated from purchases page
  $: productId = $page.url.searchParams.get('product');

  // Filter and sort conversations
  $: myProductsConversations = conversations
    .filter(conv => conv.product.seller?.id === $authStore.user?.id)
    .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());

  $: myPurchasesConversations = conversations
    .filter(conv => conv.product.seller?.id !== $authStore.user?.id)
    .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());

  $: displayedConversations = activeTab === 'products' ? myProductsConversations : myPurchasesConversations;

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
    if (product.status === 'active') {
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

  // Start polling conversation list
  function startConversationListPolling() {
    if (conversationListPollingInterval) {
      clearInterval(conversationListPollingInterval);
    }

    // Poll every 30 seconds as fallback (SSE handles real-time updates)
    conversationListPollingInterval = setInterval(pollConversationList, 30000);
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
      console.log('[Inbox] SSE connected, skipping fallback polling');
      return;
    }

    // Clear existing interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    console.log('[Inbox] SSE disconnected, starting fallback polling');
    // Poll every 10 seconds as fallback when SSE is not available
    pollingInterval = setInterval(pollNewMessages, 10000);
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
        if (typingEvent.userId !== $authStore.user?.id) {
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

    console.log('[SSE] Subscribed to product typing events:', productIdStr);
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

      if (selectedProduct.seller.id === $authStore.user.id) {
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

  onMount(async () => {
    if (!$authStore.isAuthenticated) {
      goto('/login?redirect=/inbox');
      return;
    }

    await loadConversations();

    // Connect to SSE for real-time message notifications
    if ($authStore.user?.id) {
      console.log('[Inbox] Connecting to user SSE for user:', $authStore.user.id);
      const sseClient = getUserSSE(String($authStore.user.id));
      sseClient.connect();

      // Subscribe to SSE connection state to enable/disable polling
      sseStateUnsubscribe = sseClient.state.subscribe((state) => {
        const wasConnected = sseConnected;
        sseConnected = state === 'connected';

        if (sseConnected && !wasConnected) {
          // SSE just connected - stop polling
          console.log('[Inbox] SSE connected, stopping fallback polling');
          stopPolling();
        } else if (!sseConnected && wasConnected && selectedProduct) {
          // SSE just disconnected - start polling if we have a selected conversation
          console.log('[Inbox] SSE disconnected, starting fallback polling');
          startPolling();
        }
      });

      // Subscribe to message events
      const unsubscribe = sseClient.subscribe(async (event: SSEEvent) => {
        console.log('[Inbox SSE] Received event:', event.type, event);
        if (event.type === 'new_message') {
          console.log('[Inbox SSE] New message! Product:', (event as SSEMessageEvent).productId, 'Selected:', selectedProduct?.id);
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

    // Handle visibility change - stop polling when tab is not visible
    const handleVisibilityChange = () => {
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
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup visibility listener on destroy
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  // Auto-scroll when typing indicator appears (but not when I'm typing)
  $: if (otherUserTyping && !iAmTyping && shouldAutoScroll) {
    setTimeout(scrollToBottom, 50);
  }

  onDestroy(() => {
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
            on:click={() => activeTab = 'products'}
          >
            My Products
            {#if myProductsConversations.length > 0}
              <span class="tab-badge">{myProductsConversations.length}</span>
            {/if}
          </button>
          <button
            class="tab"
            class:active={activeTab === 'purchases'}
            on:click={() => activeTab = 'purchases'}
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
            on:click={() => selectConversation(conv.product)}
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
            <button class="back-btn" on:click={handleBackToList} disabled={loadingConversation}>
              ← Back
            </button>
            <div class="product-summary">
              <h3>{selectedProduct.title}</h3>
              <p class="product-price">
                {formatPrice(selectedProduct.currentBid || selectedProduct.startingPrice, selectedProduct.seller.currency)}
                •
                <span class="status-badge status-{selectedProduct.status}">{selectedProduct.status}</span>
              </p>
            </div>
            <a href="/products/{selectedProduct.id}?from=inbox" class="view-product-link">View Product →</a>
          </div>

          <div class="chat-messages" bind:this={chatMessagesElement} on:scroll={handleScroll}>
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

          {#if !canChat}
            <div class="chat-blocked-message">
              <div class="blocked-icon">🔒</div>
              <p class="blocked-text">{chatBlockedReason}</p>
              <a href="/products/{selectedProduct.id}?from=inbox" class="view-product-btn">
                View Product Page
              </a>
            </div>
          {:else}
            <form class="chat-input-form" on:submit|preventDefault={handleSendMessage}>
              <input
                type="text"
                bind:value={newMessage}
                bind:this={chatInputElement}
                on:input={handleTyping}
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

<style>
  .inbox-page {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem 0;
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 2rem;
    color: #333;
  }

  .loading {
    text-align: center;
    padding: 3rem;
    color: #666;
    font-size: 1.2rem;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    background-color: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .empty-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .empty-state h2 {
    font-size: 1.8rem;
    color: #333;
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    color: #666;
    font-size: 1.1rem;
    margin-bottom: 2rem;
  }

  .btn-browse {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-browse:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .inbox-container {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 1.5rem;
    height: calc(100vh - 250px);
    min-height: 600px;
  }

  .conversations-list {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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
    border-bottom: 2px solid #f0f0f0;
    margin-bottom: 1rem;
  }

  .tab {
    flex: 1;
    padding: 0.75rem 1rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.9rem;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .tab:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }

  .tab.active {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    border-color: #dc2626;
    color: white;
  }

  .tab-badge {
    background: rgba(255, 255, 255, 0.3);
    padding: 0.125rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .tab.active .tab-badge {
    background: rgba(255, 255, 255, 0.9);
    color: #dc2626;
  }

  .no-conversations {
    text-align: center;
    padding: 2rem 1rem;
    color: #999;
    font-size: 0.95rem;
  }

  .conversation-item {
    width: 100%;
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    border: none;
    background: white;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s;
    margin-bottom: 0.5rem;
    text-align: left;
    position: relative;
  }

  .conversation-item:hover {
    background-color: #f9fafb;
  }

  .conversation-item.active {
    background-color: #fee;
    border-left: 4px solid #dc2626;
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
    border-radius: 6px;
    overflow: hidden;
    background-color: #f0f0f0;
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
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seller-name {
    font-size: 0.8rem;
    color: #999;
    margin: 0 0 0.35rem 0;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .last-message {
    font-size: 0.85rem;
    color: #666;
    margin: 0 0 0.25rem 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sender-name {
    font-weight: 600;
    color: #333;
  }

  .timestamp {
    font-size: 0.75rem;
    color: #999;
  }

  .unread-badge {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background-color: #dc2626;
    color: white;
    border-radius: 12px;
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .chat-area {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .chat-header {
    padding: 1.25rem;
    border-bottom: 2px solid #f0f0f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .product-summary h3 {
    font-size: 1.25rem;
    margin: 0 0 0.25rem 0;
    color: #333;
  }

  .product-price {
    margin: 0;
    font-size: 0.95rem;
    color: #666;
  }

  .status-badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .status-active {
    background-color: #10b981;
    color: white;
  }

  .status-sold {
    background-color: #6366f1;
    color: white;
  }

  .status-ended {
    background-color: #6b7280;
    color: white;
  }

  .view-product-link {
    color: #dc2626;
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
    background-color: #f0f0f0;
    padding: 0.75rem 1rem;
    border-radius: 12px;
  }

  .message.mine .message-content {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
  }

  .message-sender {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: #666;
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
    background-color: #fee;
    color: #c33;
    text-align: center;
    border-top: 1px solid #fcc;
  }

  .chat-input-form {
    display: flex;
    gap: 0.75rem;
    padding: 1.25rem;
    border-top: 2px solid #f0f0f0;
  }

  .chat-input {
    flex: 1;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-family: inherit;
  }

  .chat-input:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  .send-btn {
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .send-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .no-conversation-selected {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #999;
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
    background-color: #f0f0f0;
    border-radius: 12px;
  }

  .dot {
    width: 8px;
    height: 8px;
    background-color: #999;
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
    color: #999;
    font-style: italic;
  }

  /* Loading Older Messages */
  .loading-older {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem;
    color: #666;
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
    color: #666;
    font-size: 1rem;
    min-height: 200px;
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 3px solid #f0f0f0;
    border-top-color: #dc2626;
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
    background: linear-gradient(135deg, #fee 0%, #fdd 100%);
    border-top: 2px solid #fcc;
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
    color: #c33;
    margin: 0;
    font-weight: 500;
  }

  .view-product-btn {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
    margin-top: 0.5rem;
  }

  .view-product-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  /* Back button - hidden by default, shown on mobile */
  .back-btn {
    display: none;
    padding: 0.5rem 1rem;
    background: white;
    color: #dc2626;
    border: 2px solid #dc2626;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .back-btn:hover:not(:disabled) {
    background: #dc2626;
    color: white;
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
</style>
