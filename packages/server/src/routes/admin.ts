import { Router, Request, Response, NextFunction } from 'express';
import { getStatistics } from '../services/stats.js';
import { getFeedback, updateFeedbackStatus } from '../services/feedback.js';

const router: Router = Router();

// Admin authentication middleware
function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_SECRET_KEY;

  if (!expectedKey) {
    res.status(500).json({ error: 'Admin key not configured' });
    return;
  }

  if (adminKey !== expectedKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

// Apply auth to all admin routes
router.use(adminAuth);

// GET /api/admin/stats - Get aggregate statistics
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// GET /api/admin/feedback - Get paginated feedback list
router.get('/feedback', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;

    const result = await getFeedback(limit, offset, status);
    res.json(result);
  } catch (error) {
    console.error('Failed to get feedback:', error);
    res.status(500).json({ error: 'Failed to get feedback' });
  }
});

// POST /api/admin/feedback/:id/status - Update feedback status
router.post('/feedback/:id/status', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!id) {
      res.status(400).json({ error: 'Missing feedback ID' });
      return;
    }

    if (!['new', 'read', 'resolved'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const success = await updateFeedbackStatus(id, status as 'new' | 'read' | 'resolved');
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to update status' });
    }
  } catch (error) {
    console.error('Failed to update feedback status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

export default router;
