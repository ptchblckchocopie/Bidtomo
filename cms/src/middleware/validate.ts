import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

/**
 * Express middleware factory that validates req.body against a Zod schema.
 * Returns 400 with structured error details on failure.
 * Replaces req.body with the parsed (and coerced) data on success.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

// Reusable field: accepts string or number ID
const idField = z.union([z.string().min(1), z.number()]);

export const bidQueueSchema = z.object({
  productId: idField,
  amount: z.number().positive('Bid amount must be a positive number').finite(),
  censorName: z.boolean().optional(),
});

export const bidAcceptSchema = z.object({
  productId: idField,
});

export const profilePictureSchema = z.object({
  mediaId: idField,
});

export const voidRequestCreateSchema = z.object({
  transactionId: idField,
  reason: z.string().min(1, 'Reason is required'),
});

export const voidRequestRespondSchema = z.object({
  voidRequestId: idField,
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().optional(),
});

export const voidRequestSellerChoiceSchema = z.object({
  voidRequestId: idField,
  choice: z.enum(['restart_bidding', 'offer_second_bidder']),
});

export const voidRequestSecondBidderSchema = z.object({
  voidRequestId: idField,
  action: z.enum(['accept', 'decline']),
});

export const typingSchema = z.object({
  product: idField,
  isTyping: z.boolean(),
});

export const reportCreateSchema = z.object({
  productId: idField,
  reason: z.enum(['spam', 'inappropriate', 'scam', 'counterfeit', 'other']),
  description: z.string().max(1000).optional(),
});

export const analyticsTrackSchema = z.object({
  events: z.array(z.object({
    eventType: z.string().min(1),
    page: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    sessionId: z.string().optional(),
    deviceInfo: z.record(z.string(), z.any()).optional(),
    referrer: z.string().optional(),
  })).min(1).max(10),
});
