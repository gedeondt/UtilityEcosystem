import { Router } from 'express';
import { getAverageConsumptionByHour, getDatalakeFolderStats } from '../services/datalakeService.js';

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

router.get('/silver/hourly-average-consumption', async (_req, res) => {
  try {
    const rows = await getAverageConsumptionByHour();
    res.json({ rows });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      res.status(404).json({ message: 'Hourly average consumption dataset not found' });
      return;
    }

    console.error('Failed to read hourly average consumption dataset', error);
    res.status(500).json({ message: 'Failed to read hourly average consumption dataset' });
  }
});

export default router;
