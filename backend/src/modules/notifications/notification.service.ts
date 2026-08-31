import { Request, Response, Router } from 'express';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';

export interface CreateNotificationParams {
  organizationId: string;
  siteId?: string;
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await query(`
      INSERT INTO notifications (organization_id, site_id, recipient_user_id, type, title, message, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      params.organizationId,
      params.siteId || null,
      params.recipientUserId,
      params.type,
      params.title,
      params.message,
      params.data ? JSON.stringify(params.data) : '{}',
    ]);
  } catch (err: any) {
    console.error('Failed to create notification:', err.message);
  }
}

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const notifRes = await query(`
      SELECT id, type, title, message, data, is_read, created_at
      FROM notifications
      WHERE recipient_user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [userId]);

    res.json({ success: true, data: notifRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'NOTIF_FETCH_FAILED', message: err.message } });
  }
});

router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const notifId = req.params.id;

    await query(`
      UPDATE notifications
      SET is_read = TRUE, read_at = NOW()
      WHERE id = $1 AND recipient_user_id = $2
    `, [notifId, userId]);

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'NOTIF_UPDATE_FAILED', message: err.message } });
  }
});

export const notificationRouter = router;
