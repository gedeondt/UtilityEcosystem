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

async function sendHourlyAverageConsumption(_req, res) {
  try {
    const dataset = await getAverageConsumptionByHour();
    res.json(dataset);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      res.status(404).json({ message: 'Hourly average consumption dataset not found' });
      return;
    }

    console.error('Failed to read hourly average consumption dataset', error);
    res.status(500).json({ message: 'Failed to read hourly average consumption dataset' });
  }
}

router.get('/gold/hourly-average-consumption', sendHourlyAverageConsumption);
router.get('/silver/hourly-average-consumption', sendHourlyAverageConsumption);

export default router;
