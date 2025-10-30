import express from 'express';
import cors from 'cors';
import datalakeRouter from './routes/datalake.js';
import eventlogRouter from './routes/eventlog.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/datalake', datalakeRouter);
app.use('/api/eventlog', eventlogRouter);

app.listen(PORT, () => {
  console.log(`Control Center backend running on port ${PORT}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
