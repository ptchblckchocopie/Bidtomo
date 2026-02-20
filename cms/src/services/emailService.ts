import { Resend } from 'resend';
import Redis from 'ioredis';
import type { Payload } from 'payload';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
const EMAIL_QUEUE_KEY = 'email:queue';
const EMAIL_PROCESSING_KEY = 'email:processing';
const RATE_LIMIT = 2; // Max 2 emails per second
const RATE_WINDOW = 1000; // 1 second in milliseconds

// Redis clients
let redis: Redis | null = null;
let redisConnected = false;

// Resend client
let resend: Resend | null = null;

// Email queue processor state
let processorRunning = false;
let lastSendTime = 0;
let emailsSentInWindow = 0;

export interface EmailPayload {
  to: string | string[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
  // Metadata for logging
  metadata?: {
    type?: string;
    productId?: number;
    userId?: number;
    transactionId?: number;
    voidRequestId?: number;
  };
}

interface QueuedEmail extends EmailPayload {
  id: string;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}

// Initialize Redis connection
function getRedis(): Redis {
  if (redis) return redis;

  redis = new Redis(REDIS_URL, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 500, 5000);
      console.log(`[EMAIL] Redis reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  redis.on('connect', () => {
    console.log('[EMAIL] Redis connected');
    redisConnected = true;
    // Start processor when Redis connects
    startEmailProcessor();
  });

  redis.on('error', (err) => {
    console.error('[EMAIL] Redis error:', err.message);
    redisConnected = false;
  });

  redis.on('close', () => {
    console.log('[EMAIL] Redis disconnected');
    redisConnected = false;
  });

  redis.connect().catch((err) => {
    console.warn('[EMAIL] Redis initial connection failed:', err.message);
  });

  return redis;
}

// Initialize Resend client
function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Generate unique email ID
function generateEmailId(): string {
  return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Queue an email for sending with rate limiting
 * Returns immediately after queueing
 */
export async function queueEmail(payload: EmailPayload): Promise<{ success: boolean; emailId?: string; error?: string }> {
  try {
    const client = getRedis();

    if (!redisConnected) {
      // Wait a bit for connection
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!redisConnected) {
        // Fallback to direct send if Redis unavailable
        console.warn('[EMAIL] Redis not connected, sending directly');
        return sendEmailDirect(payload);
      }
    }

    const queuedEmail: QueuedEmail = {
      ...payload,
      id: generateEmailId(),
      queuedAt: Date.now(),
      attempts: 0,
    };

    await client.rpush(EMAIL_QUEUE_KEY, JSON.stringify(queuedEmail));
    console.log(`[EMAIL] Queued email ${queuedEmail.id} to ${payload.to}`);

    // Ensure processor is running
    startEmailProcessor();

    return { success: true, emailId: queuedEmail.id };
  } catch (error) {
    console.error('[EMAIL] Failed to queue email:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Send email directly without queueing (fallback)
 */
export async function sendEmailDirect(payload: EmailPayload): Promise<{ success: boolean; emailId?: string; error?: string }> {
  try {
    const client = getResend();

    const result = await client.emails.send({
      from: payload.from || `${process.env.DEFAULT_FROM_NAME} <${process.env.DEFAULT_FROM_ADDRESS}>`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html || '',
      text: payload.text || '',
      cc: payload.cc,
      bcc: payload.bcc,
      replyTo: payload.replyTo,
      headers: {
        'X-Email-Type': payload.metadata?.type || 'transactional',
      },
      tags: payload.tags || [
        { name: 'environment', value: process.env.NODE_ENV || 'development' },
      ],
    });

    if (result.error) {
      console.error('[EMAIL] Resend API error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log(`[EMAIL] Sent directly: ${result.data?.id}`);
    return { success: true, emailId: result.data?.id };
  } catch (error: any) {
    console.error('[EMAIL] Direct send failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process the email queue with rate limiting (max 2 emails/second)
 */
async function processEmailQueue(): Promise<void> {
  if (!redisConnected) return;

  const client = getRedis();

  try {
    // Check rate limit
    const now = Date.now();
    if (now - lastSendTime >= RATE_WINDOW) {
      // Reset counter for new window
      emailsSentInWindow = 0;
      lastSendTime = now;
    }

    if (emailsSentInWindow >= RATE_LIMIT) {
      // Wait until next window
      const waitTime = RATE_WINDOW - (now - lastSendTime);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      emailsSentInWindow = 0;
      lastSendTime = Date.now();
    }

    // Get next email from queue (blocking pop with 1 second timeout)
    const result = await client.blpop(EMAIL_QUEUE_KEY, 1);

    if (!result) return; // No email in queue

    const [, emailJson] = result;
    const email: QueuedEmail = JSON.parse(emailJson);

    // Mark as processing
    await client.hset(EMAIL_PROCESSING_KEY, email.id, emailJson);

    try {
      const sendResult = await sendEmailDirect(email);

      if (sendResult.success) {
        // Successfully sent, remove from processing
        await client.hdel(EMAIL_PROCESSING_KEY, email.id);
        emailsSentInWindow++;
        console.log(`[EMAIL] Successfully processed ${email.id}`);
      } else {
        // Failed, handle retry
        email.attempts++;
        email.lastError = sendResult.error;

        if (email.attempts < 3) {
          // Re-queue for retry with delay
          console.log(`[EMAIL] Retry ${email.attempts}/3 for ${email.id}`);
          await new Promise((resolve) => setTimeout(resolve, email.attempts * 2000));
          await client.rpush(EMAIL_QUEUE_KEY, JSON.stringify(email));
        } else {
          // Max retries reached, log failure
          console.error(`[EMAIL] Failed after 3 attempts: ${email.id} - ${email.lastError}`);
          // Send alert to support
          await sendSupportAlert(email);
        }

        await client.hdel(EMAIL_PROCESSING_KEY, email.id);
      }
    } catch (error: any) {
      console.error(`[EMAIL] Error processing ${email.id}:`, error);
      email.attempts++;
      email.lastError = error.message;

      if (email.attempts < 3) {
        await client.rpush(EMAIL_QUEUE_KEY, JSON.stringify(email));
      }
      await client.hdel(EMAIL_PROCESSING_KEY, email.id);
    }
  } catch (error) {
    console.error('[EMAIL] Queue processor error:', error);
  }
}

/**
 * Send alert email to support when an email fails after all retries
 */
async function sendSupportAlert(failedEmail: QueuedEmail): Promise<void> {
  try {
    const supportEmail = process.env.SUPPORT_EMAIL;
    if (!supportEmail) return;

    await sendEmailDirect({
      to: supportEmail,
      subject: `[ALERT] Email Failed After Multiple Attempts`,
      html: `
        <h2>Email Sending Failed</h2>
        <p><strong>Email ID:</strong> ${failedEmail.id}</p>
        <p><strong>Recipient:</strong> ${JSON.stringify(failedEmail.to)}</p>
        <p><strong>Subject:</strong> ${failedEmail.subject}</p>
        <p><strong>Attempts:</strong> ${failedEmail.attempts}</p>
        <p><strong>Last Error:</strong> ${failedEmail.lastError}</p>
        <p><strong>Queued At:</strong> ${new Date(failedEmail.queuedAt).toISOString()}</p>
        ${failedEmail.metadata ? `<p><strong>Metadata:</strong> ${JSON.stringify(failedEmail.metadata)}</p>` : ''}
      `,
      metadata: { type: 'support_alert' },
    });
    console.log(`[EMAIL] Support alert sent for failed email ${failedEmail.id}`);
  } catch (error) {
    console.error('[EMAIL] Failed to send support alert:', error);
  }
}

/**
 * Start the email queue processor
 */
function startEmailProcessor(): void {
  if (processorRunning) return;

  processorRunning = true;
  console.log('[EMAIL] Starting email queue processor');

  const runProcessor = async () => {
    while (processorRunning && redisConnected) {
      await processEmailQueue();
    }
    console.log('[EMAIL] Email queue processor stopped');
  };

  runProcessor().catch((error) => {
    console.error('[EMAIL] Processor crashed:', error);
    processorRunning = false;
    // Restart after delay
    setTimeout(startEmailProcessor, 5000);
  });
}

/**
 * Stop the email queue processor
 */
export function stopEmailProcessor(): void {
  processorRunning = false;
}

/**
 * Get queue statistics
 */
export async function getEmailQueueStats(): Promise<{
  queued: number;
  processing: number;
}> {
  try {
    const client = getRedis();
    const queued = await client.llen(EMAIL_QUEUE_KEY);
    const processing = await client.hlen(EMAIL_PROCESSING_KEY);
    return { queued, processing };
  } catch (error) {
    return { queued: 0, processing: 0 };
  }
}

// Initialize on import
getRedis();

// ============================================
// Email Template Helpers for Marketplace
// ============================================

/**
 * Send void request notification email
 */
export async function sendVoidRequestEmail(params: {
  to: string;
  productTitle: string;
  initiatorName: string;
  reason: string;
  isInitiator: boolean;
  productId: number;
  voidRequestId: number;
}): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const { to, productTitle, initiatorName, reason, isInitiator, productId, voidRequestId } = params;

  const subject = isInitiator
    ? `Your void request for "${productTitle}" has been submitted`
    : `${initiatorName} has requested to void the transaction for "${productTitle}"`;

  const html = isInitiator
    ? `
      <h2>Void Request Submitted</h2>
      <p>Your void request for <strong>${productTitle}</strong> has been submitted.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>Please wait for the other party to review and respond to your request.</p>
    `
    : `
      <h2>Void Request Received</h2>
      <p><strong>${initiatorName}</strong> has requested to void the transaction for <strong>${productTitle}</strong>.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>Please review this request and respond in your inbox.</p>
    `;

  return queueEmail({
    to,
    subject,
    html,
    metadata: {
      type: 'void_request',
      productId,
      voidRequestId,
    },
  });
}

/**
 * Send void approved/rejected notification email
 */
export async function sendVoidResponseEmail(params: {
  to: string;
  productTitle: string;
  approved: boolean;
  rejectionReason?: string;
  productId: number;
  voidRequestId: number;
}): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const { to, productTitle, approved, rejectionReason, productId, voidRequestId } = params;

  const subject = approved
    ? `Void request for "${productTitle}" has been approved`
    : `Void request for "${productTitle}" has been rejected`;

  const html = approved
    ? `
      <h2>Void Request Approved</h2>
      <p>The void request for <strong>${productTitle}</strong> has been approved by the other party.</p>
      <p>The transaction has been voided. Please check your inbox for next steps.</p>
    `
    : `
      <h2>Void Request Rejected</h2>
      <p>The void request for <strong>${productTitle}</strong> has been rejected.</p>
      ${rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
      <p>The transaction remains active.</p>
    `;

  return queueEmail({
    to,
    subject,
    html,
    metadata: {
      type: 'void_response',
      productId,
      voidRequestId,
    },
  });
}

/**
 * Send auction restarted notification to all bidders
 */
export async function sendAuctionRestartedEmail(params: {
  to: string;
  productTitle: string;
  productId: number;
  newEndDate: string;
}): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const { to, productTitle, productId, newEndDate } = params;

  return queueEmail({
    to,
    subject: `Bidding has reopened for "${productTitle}"!`,
    html: `
      <h2>Auction Reopened!</h2>
      <p>Good news! Bidding has been reopened for <strong>${productTitle}</strong>.</p>
      <p>The previous transaction was voided, and you now have another chance to place your bid.</p>
      <p><strong>New auction end date:</strong> ${new Date(newEndDate).toLocaleString()}</p>
      <p>Don't miss out - place your bid now!</p>
    `,
    metadata: {
      type: 'auction_restarted',
      productId,
    },
  });
}

/**
 * Send second bidder offer notification
 */
export async function sendSecondBidderOfferEmail(params: {
  to: string;
  productTitle: string;
  offerAmount: number;
  currency: string;
  productId: number;
  voidRequestId: number;
}): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const { to, productTitle, offerAmount, currency, productId, voidRequestId } = params;

  const currencySymbols: Record<string, string> = {
    PHP: '₱',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
  };
  const symbol = currencySymbols[currency] || currency;

  return queueEmail({
    to,
    subject: `You have an offer to purchase "${productTitle}"!`,
    html: `
      <h2>Special Offer!</h2>
      <p>The original transaction for <strong>${productTitle}</strong> was voided, and the seller has offered the item to you!</p>
      <p><strong>Your bid amount:</strong> ${symbol}${offerAmount.toLocaleString()}</p>
      <p>Please check your inbox to accept or decline this offer.</p>
    `,
    metadata: {
      type: 'second_bidder_offer',
      productId,
      voidRequestId,
    },
  });
}

// ============================================
// Template-Based Email Functions
// ============================================

export interface EmailTemplateVariables {
  buyerName?: string;
  buyerEmail?: string;
  sellerName?: string;
  sellerEmail?: string;
  productTitle?: string;
  productId?: number | string;
  bidAmount?: number | string;
  currencySymbol?: string;
  auctionEndDate?: string;
  reason?: string;
  platformName?: string;
  platformUrl?: string;
  [key: string]: string | number | undefined;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  PHP: '₱',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

/**
 * Replace template variables in content
 * Variables are in {{variableName}} format
 */
export function renderTemplate(template: string, variables: EmailTemplateVariables): string {
  let result = template;

  // Add default platform variables
  const allVariables = {
    platformName: 'Veent Marketplace',
    platformUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    ...variables,
  };

  // Replace all {{variable}} patterns
  for (const [key, value] of Object.entries(allVariables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, String(value ?? ''));
  }

  return result;
}

/**
 * Get email template from database by type
 */
export async function getEmailTemplate(
  payload: Payload,
  type: string
): Promise<{ subject: string; htmlContent: string; textContent?: string } | null> {
  try {
    const templates = await payload.find({
      collection: 'email-templates',
      where: {
        type: { equals: type },
        active: { equals: true },
      },
      limit: 1,
    });

    if (templates.docs.length === 0) {
      console.warn(`[EMAIL] No active template found for type: ${type}`);
      return null;
    }

    const template = templates.docs[0] as any;
    return {
      subject: template.subject,
      htmlContent: template.htmlContent,
      textContent: template.textContent,
    };
  } catch (error) {
    console.error(`[EMAIL] Error fetching template for type ${type}:`, error);
    return null;
  }
}

/**
 * Send email using template from database
 */
export async function sendTemplateEmail(
  payload: Payload,
  params: {
    to: string | string[];
    templateType: string;
    variables: EmailTemplateVariables;
    fallback?: {
      subject: string;
      html: string;
      text?: string;
    };
    metadata?: EmailPayload['metadata'];
  }
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const { to, templateType, variables, fallback, metadata } = params;

  // Try to get template from database
  const template = await getEmailTemplate(payload, templateType);

  let subject: string;
  let html: string;
  let text: string | undefined;

  if (template) {
    subject = renderTemplate(template.subject, variables);
    html = renderTemplate(template.htmlContent, variables);
    text = template.textContent ? renderTemplate(template.textContent, variables) : undefined;
  } else if (fallback) {
    // Use fallback if template not found
    subject = renderTemplate(fallback.subject, variables);
    html = renderTemplate(fallback.html, variables);
    text = fallback.text ? renderTemplate(fallback.text, variables) : undefined;
  } else {
    console.error(`[EMAIL] No template or fallback for type: ${templateType}`);
    return { success: false, error: `No template found for type: ${templateType}` };
  }

  return queueEmail({
    to,
    subject,
    html,
    text,
    metadata,
  });
}

/**
 * Send bid won notification to buyer
 */
export async function sendBidWonBuyerEmail(
  payload: Payload,
  params: {
    buyerEmail: string;
    buyerName: string;
    sellerName: string;
    productTitle: string;
    productId: number;
    bidAmount: number;
    currency: string;
  }
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const { buyerEmail, buyerName, sellerName, productTitle, productId, bidAmount, currency } = params;
  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency;

  return sendTemplateEmail(payload, {
    to: buyerEmail,
    templateType: 'bid_won_buyer',
    variables: {
      buyerName,
      buyerEmail,
      sellerName,
      productTitle,
      productId,
      bidAmount,
      currencySymbol,
    },
    fallback: {
      subject: `Congratulations! You won the bid for "${productTitle}"`,
      html: `
        <h2>Congratulations ${buyerName}!</h2>
        <p>Your bid has been accepted for <strong>${productTitle}</strong>.</p>
        <p><strong>Winning Bid:</strong> ${currencySymbol}${bidAmount.toLocaleString()}</p>
        <p><strong>Seller:</strong> ${sellerName}</p>
        <p>The seller will contact you shortly to arrange the transaction.</p>
      `,
    },
    metadata: {
      type: 'bid_won_buyer',
      productId,
    },
  });
}

/**
 * Send bid won notification to seller
 */
export async function sendBidWonSellerEmail(
  payload: Payload,
  params: {
    sellerEmail: string;
    sellerName: string;
    buyerName: string;
    buyerEmail: string;
    productTitle: string;
    productId: number;
    bidAmount: number;
    currency: string;
  }
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const { sellerEmail, sellerName, buyerName, buyerEmail, productTitle, productId, bidAmount, currency } = params;
  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency;

  return sendTemplateEmail(payload, {
    to: sellerEmail,
    templateType: 'bid_won_seller',
    variables: {
      sellerName,
      sellerEmail,
      buyerName,
      buyerEmail,
      productTitle,
      productId,
      bidAmount,
      currencySymbol,
    },
    fallback: {
      subject: `Your item "${productTitle}" has been sold!`,
      html: `
        <h2>Congratulations ${sellerName}!</h2>
        <p>Your item <strong>${productTitle}</strong> has been sold.</p>
        <p><strong>Winning Bid:</strong> ${currencySymbol}${bidAmount.toLocaleString()}</p>
        <p><strong>Buyer:</strong> ${buyerName} (${buyerEmail})</p>
        <p>Please reach out to the buyer to arrange payment and delivery.</p>
      `,
    },
    metadata: {
      type: 'bid_won_seller',
      productId,
    },
  });
}

/**
 * Send auction restarted notification using template
 */
export async function sendAuctionRestartedTemplateEmail(
  payload: Payload,
  params: {
    to: string;
    buyerName: string;
    productTitle: string;
    productId: number;
    auctionEndDate: string;
  }
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const { to, buyerName, productTitle, productId, auctionEndDate } = params;

  return sendTemplateEmail(payload, {
    to,
    templateType: 'auction_restarted',
    variables: {
      buyerName,
      productTitle,
      productId,
      auctionEndDate: new Date(auctionEndDate).toLocaleString(),
    },
    fallback: {
      subject: `Bidding has reopened for "${productTitle}"!`,
      html: `
        <h2>Auction Reopened!</h2>
        <p>Hi ${buyerName},</p>
        <p>Good news! Bidding has been reopened for <strong>${productTitle}</strong>.</p>
        <p><strong>New auction end date:</strong> ${new Date(auctionEndDate).toLocaleString()}</p>
        <p>Don't miss out - place your bid now!</p>
      `,
    },
    metadata: {
      type: 'auction_restarted',
      productId,
    },
  });
}
