import { Router, Request, Response } from 'express';
import { submitFeedback, hashIP, getClientIP } from '../services/feedback.js';

const router: Router = Router();

// POST /api/feedback - Submit feedback (public, rate-limited)
router.post('/feedback', async (req: Request, res: Response) => {
  try {
    const { message, contactEmail } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ success: false, error: 'Message is required' });
      return;
    }

    const clientIP = getClientIP(req);
    const ipHash = hashIP(clientIP);

    const result = await submitFeedback({
      message,
      contactEmail: contactEmail || undefined,
      ipHash
    });

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Failed to submit feedback:', error);
    res.status(500).json({ success: false, error: 'Failed to submit feedback' });
  }
});

export default router;
