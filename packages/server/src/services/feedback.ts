import { createHash } from 'crypto';
import { supabase, isSupabaseConfigured } from './supabase.js';

const RATE_LIMIT_MAX = 5; // Max submissions per window
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function hashIP(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

export function getClientIP(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  // Check for forwarded IP (Railway, Vercel, etc.)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips?.trim() || 'unknown';
  }
  return req.socket?.remoteAddress || 'unknown';
}

export async function checkRateLimit(ipHash: string): Promise<{ allowed: boolean; remaining: number }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  }

  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

    // Get existing rate limit record
    const { data: existing } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('ip_hash', ipHash)
      .single();

    if (!existing) {
      // First submission from this IP
      await supabase.from('rate_limits').insert({
        ip_hash: ipHash,
        count: 1,
        window_start: now.toISOString()
      });
      return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
    }

    // Check if window has expired
    const existingWindowStart = new Date(existing.window_start);
    if (existingWindowStart < windowStart) {
      // Reset window
      await supabase.from('rate_limits').update({
        count: 1,
        window_start: now.toISOString()
      }).eq('ip_hash', ipHash);
      return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
    }

    // Check if within limit
    if (existing.count >= RATE_LIMIT_MAX) {
      return { allowed: false, remaining: 0 };
    }

    // Increment count
    await supabase.from('rate_limits').update({
      count: existing.count + 1
    }).eq('ip_hash', ipHash);

    return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count - 1 };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Fail open - allow the request if rate limiting fails
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  }
}

export interface FeedbackSubmission {
  message: string;
  contactEmail?: string;
  ipHash: string;
}

export async function submitFeedback(
  submission: FeedbackSubmission
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Feedback system not configured' };
  }

  // Validate message
  if (!submission.message || submission.message.trim().length === 0) {
    return { success: false, error: 'Message is required' };
  }

  if (submission.message.length > 1000) {
    return { success: false, error: 'Message too long (max 1000 characters)' };
  }

  // Validate email if provided
  if (submission.contactEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(submission.contactEmail)) {
      return { success: false, error: 'Invalid email format' };
    }
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(submission.ipHash);
  if (!rateLimit.allowed) {
    return { success: false, error: 'Too many submissions. Please try again later.' };
  }

  try {
    const { error } = await supabase.from('feedback').insert({
      message: submission.message.trim(),
      contact_email: submission.contactEmail?.trim() || null,
      ip_hash: submission.ipHash,
      status: 'new'
    });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Failed to submit feedback:', error);
    return { success: false, error: 'Failed to submit feedback' };
  }
}

export interface Feedback {
  id: string;
  message: string;
  contact_email: string | null;
  created_at: string;
  status: 'new' | 'read' | 'resolved';
}

export async function getFeedback(
  limit: number = 50,
  offset: number = 0,
  status?: string
): Promise<{ data: Feedback[]; total: number }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { data: [], total: 0 };
  }

  try {
    let query = supabase
      .from('feedback')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    return { data: data || [], total: count || 0 };
  } catch (error) {
    console.error('Failed to get feedback:', error);
    return { data: [], total: 0 };
  }
}

export async function updateFeedbackStatus(
  id: string,
  status: 'new' | 'read' | 'resolved'
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) {
    return false;
  }

  try {
    const { error } = await supabase
      .from('feedback')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to update feedback status:', error);
    return false;
  }
}
