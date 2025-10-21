<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import { fetchConversations, fetchProductMessages, fetchProduct, sendMessage, markMessageAsRead } from '$lib/api';
  import type { Product, Message } from '$lib/api';
  import { goto } from '$app/navigation';

  let conversations: { product: Product; lastMessage: Message; unreadCount: number }[] = [];
  let selectedProduct: Product | null = null;
  let messages: Message[] = [];
  let newMessage = '';
  let loading = true;
  let sendingMessage = false;
  let error = '';

  // Get product ID from query params if navigated from purchases page
  $: productId = $page.url.searchParams.get('product');

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

  async function loadConversations() {
    loading = true;
    try {
      conversations = await fetchConversations();

      // If product ID is in URL, auto-select that conversation or load the product
      if (productId) {
        const conv = conversations.find(c => c.product.id === productId);
        if (conv) {
          // Existing conversation found
          await selectConversation(conv.product);
        } else {
          // No conversation yet, but we can still load the product and start messaging
          try {
            const product = await fetchProduct(productId);
            if (product) {
              selectedProduct = product;
              messages = await fetchProductMessages(product.id);
            }
          } catch (err) {
            console.error('Error loading product:', err);
          }
        }
      }
    } catch (err) {
      error = 'Failed to load conversations';
      console.error('Error loading conversations:', err);
    } finally {
      loading = false;
    }
  }

  async function selectConversation(product: Product) {
    selectedProduct = product;
    messages = await fetchProductMessages(product.id);

    // Mark messages as read
    for (const msg of messages) {
      const receiverId = typeof msg.receiver === 'object' ? msg.receiver.id : msg.receiver;
      if (receiverId === $authStore.user?.id && !msg.read) {
        await markMessageAsRead(msg.id);
      }
    }

    // Scroll to bottom
    setTimeout(() => {
      const chatMessages = document.querySelector('.chat-messages');
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }, 100);
  }

  async function handleSendMessage() {
    if (!newMessage.trim() || !selectedProduct || !$authStore.user) return;

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
        messages = [...messages, message];
        newMessage = '';

        // Scroll to bottom
        setTimeout(() => {
          const chatMessages = document.querySelector('.chat-messages');
          if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        }, 100);
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
      <aside class="conversations-list">
        <h2>Conversations</h2>
        {#each conversations as conv}
          <button
            class="conversation-item"
            class:active={selectedProduct?.id === conv.product.id}
            on:click={() => selectConversation(conv.product)}
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
              <p class="last-message">
                {#if conv.lastMessage}
                  {@const otherUser = getOtherUser(conv.lastMessage)}
                  {#if otherUser}
                    <span class="sender-name">{otherUser.name}:</span>
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
      <main class="chat-area">
        {#if selectedProduct}
          <div class="chat-header">
            <div class="product-summary">
              <h3>{selectedProduct.title}</h3>
              <p class="product-price">
                {formatPrice(selectedProduct.currentBid || selectedProduct.startingPrice, selectedProduct.seller.currency)}
                •
                <span class="status-badge status-{selectedProduct.status}">{selectedProduct.status}</span>
              </p>
            </div>
            <a href="/products/{selectedProduct.id}" class="view-product-link">View Product →</a>
          </div>

          <div class="chat-messages">
            {#each messages as message}
              {@const isMine = $authStore.user?.id === (typeof message.sender === 'object' ? message.sender.id : message.sender)}
              {@const sender = typeof message.sender === 'object' ? message.sender : null}

              <div class="message" class:mine={isMine}>
                <div class="message-content">
                  {#if !isMine && sender}
                    <span class="message-sender">{sender.name}</span>
                  {/if}
                  <p>{message.message}</p>
                  <span class="message-time">{formatDate(message.createdAt)}</span>
                </div>
              </div>
            {/each}
          </div>

          {#if error}
            <div class="error-message">{error}</div>
          {/if}

          <form class="chat-input-form" on:submit|preventDefault={handleSendMessage}>
            <input
              type="text"
              bind:value={newMessage}
              placeholder="Type your message..."
              class="chat-input"
              disabled={sendingMessage}
            />
            <button type="submit" class="send-btn" disabled={sendingMessage || !newMessage.trim()}>
              {sendingMessage ? 'Sending...' : 'Send'}
            </button>
          </form>
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
  }

  .conversations-list h2 {
    font-size: 1.25rem;
    margin-bottom: 1rem;
    padding: 0 0.5rem;
    color: #333;
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
</style>
