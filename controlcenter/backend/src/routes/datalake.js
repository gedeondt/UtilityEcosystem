import { Router } from 'express';
import { getDatalakeFolderStats } from '../services/datalakeService.js';

const router = Router();

router.get('/stats', async (_req, res) => {
  try {
    const stats = await getDatalakeFolderStats();
    res.json({ stats });
  } catch (error) {
    console.error('Failed to read datalake stats', error);
    res.status(500).json({ message: 'Failed to read datalake stats' });
  }
});

export default router;
