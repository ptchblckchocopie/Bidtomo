import { BRIDGE_URL, getAuthHeaders, handleExpiredToken } from './_shared';
import type { Product, Message } from './types';

export async function sendMessage(productId: string, receiverId: string, message: string): Promise<Message | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/messages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        product: productId,
        receiver: receiverId,
        message,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    const data = await response.json();
    return data.doc || data;
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
}

export async function fetchProductMessages(
  productId: string,
  after?: string,
  options?: { limit?: number; before?: string; latest?: boolean }
): Promise<Message[]> {
  try {
    const sortOrder = options?.latest ? '-createdAt' : 'createdAt';
    let url = `${BRIDGE_URL}/api/bridge/messages?where[product][equals]=${productId}&sort=${sortOrder}`;

    if (after) {
      url += `&where[createdAt][greater_than]=${after}`;
    }

    if (options?.before) {
      url += `&where[createdAt][less_than]=${options.before}`;
    }

    if (options?.limit) {
      url += `&limit=${options.limit}`;
    }

    const response = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch messages');
    }

    const data = await response.json();
    const messages = data.docs || [];

    return options?.latest ? messages.reverse() : messages;
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
}

export async function fetchMessageById(messageId: string | number): Promise<Message | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/messages/${messageId}?depth=1`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching message:', error);
    return null;
  }
}

export async function fetchConversations(): Promise<{ product: Product; lastMessage: Message; unreadCount: number }[]> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/conversations`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        handleExpiredToken();
        return [];
      }
      throw new Error('Failed to fetch conversations');
    }

    const data = await response.json();
    return data.conversations || [];
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
}

export async function getUnreadMessageCount(): Promise<number> {
  try {
    const conversations = await fetchConversations();
    return conversations.reduce((total, conv) => total + conv.unreadCount, 0);
  } catch (error) {
    console.error('Error fetching unread message count:', error);
    return 0;
  }
}

export async function setTypingStatus(productId: string, isTyping: boolean): Promise<void> {
  try {
    await fetch(`${BRIDGE_URL}/api/bridge/typing`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        product: productId,
        isTyping,
      }),
    });
  } catch (error) {
    console.error('Error setting typing status:', error);
  }
}

export async function getTypingStatus(productId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/typing/${productId}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.typing || false;
  } catch (error) {
    console.error('Error getting typing status:', error);
    return false;
  }
}

export async function markMessageAsRead(messageId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/messages/${messageId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ read: true }),
    });

    return response.ok;
  } catch (error) {
    console.error('Error marking message as read:', error);
    return false;
  }
}
