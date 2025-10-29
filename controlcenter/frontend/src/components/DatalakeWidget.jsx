import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Cell,
} from 'recharts';
import { getApiBaseUrl } from '../utils/api.js';
import './DatalakeWidget.css';

const COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#6366f1'];

export default function DatalakeWidget() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/datalake/stats`);

      if (!response.ok) {
        throw new Error('No se pudieron cargar los datos del datalake');
      }

      const payload = await response.json();
      setData(payload.stats ?? []);
    } catch (err) {
      setError(err.message || 'Error inesperado al cargar los datos');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const totalFiles = useMemo(() => data.reduce((acc, item) => acc + item.fileCount, 0), [data]);

  if (isLoading) {
    return <div className="widget-state">Cargando datos del datalake…</div>;
  }

  if (error) {
    return (
      <div className="widget-state widget-state--error">
        <p>{error}</p>
        <button type="button" onClick={fetchStats}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!data.length) {
    return <div className="widget-state">No se encontraron carpetas en el datalake.</div>;
  }

  return (
    <div className="datalake-widget">
      <div className="widget-summary">
        <div>
          <h3>{totalFiles.toLocaleString('es-ES')}</h3>
          <p>Ficheros totales</p>
        </div>
        <span>{data.length} carpetas analizadas</span>
      </div>
      <div className="widget-chart">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 12 }} />
            <YAxis tick={{ fill: '#475569', fontSize: 12 }} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} />
            <Bar dataKey="fileCount" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="widget-breakdown">
        {data.map((folder) => (
          <li key={folder.name}>
            <span>{folder.name}</span>
            <span>{folder.fileCount.toLocaleString('es-ES')} ficheros</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
