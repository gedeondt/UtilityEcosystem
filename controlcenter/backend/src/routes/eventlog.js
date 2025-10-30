import { Router } from 'express';
import { getEventLogChannelStats } from '../services/eventlogService.js';

const router = Router();

router.get('/channels', async (_req, res) => {
  try {
    const channels = await getEventLogChannelStats();
    res.json({ channels });
  } catch (error) {
    console.error('Failed to read event log channel stats', error);
    res.status(500).json({ message: 'Failed to read event log channels' });
  }
});

export default router;
