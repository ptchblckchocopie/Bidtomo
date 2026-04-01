import type { Response } from 'express';

/**
 * Send a standardized error response.
 * Always returns { success: false, error: message }
 */
export function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
}

/**
 * Send a standardized success response.
 * Always returns { success: true, ...data }
 */
export function sendSuccess(res: Response, data: Record<string, any> = {}): void {
  res.json({ success: true, ...data });
}
