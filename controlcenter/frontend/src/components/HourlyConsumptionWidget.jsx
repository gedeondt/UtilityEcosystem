import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { getApiBaseUrl } from '../utils/api.js';
import './HourlyConsumptionWidget.css';

function formatHourLabel(hour) {
  if (!Number.isFinite(hour)) {
    return '–';
  }

  return `${hour.toString().padStart(2, '0')}:00`;
}

function formatKwh(value) {
  if (!Number.isFinite(value)) {
    return '–';
  }

  return `${value.toFixed(2)} kWh`;
}

function HourlyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const [{ value }] = payload;

  return (
    <div className="hourly-tooltip">
      <span>{label}</span>
      <strong>{formatKwh(value)}</strong>
    </div>
  );
}

export default function HourlyConsumptionWidget() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDataset = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/datalake/silver/hourly-average-consumption`
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Todavía no se ha generado el dataset de consumo medio.');
        }

        throw new Error('No se pudo consultar el dataset de consumo medio.');
      }

      const payload = await response.json();
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      setData(rows);
    } catch (err) {
      setError(err.message || 'Error inesperado al cargar el dataset.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDataset();
  }, [fetchDataset]);

  const chartData = useMemo(
    () =>
      data
        .map((row) => ({
          hour: Number(row.hour),
          label: formatHourLabel(Number(row.hour)),
          averageConsumption: Number(row.averageConsumptionKwh ?? row.average_consumption_kwh),
        }))
        .filter((row) => Number.isFinite(row.hour) && Number.isFinite(row.averageConsumption))
        .sort((a, b) => a.hour - b.hour),
    [data]
  );

  const insights = useMemo(() => {
    if (!chartData.length) {
      return null;
    }

    const total = chartData.reduce((acc, row) => acc + row.averageConsumption, 0);
    const peak = chartData.reduce(
      (current, row) => (row.averageConsumption > current.averageConsumption ? row : current),
      chartData[0]
    );
    const lowest = chartData.reduce(
      (current, row) => (row.averageConsumption < current.averageConsumption ? row : current),
      chartData[0]
    );

    return {
      dailyAverage: total / chartData.length,
      peak,
      lowest,
    };
  }, [chartData]);

  const dailyAverage = insights?.dailyAverage ?? 0;
  const peak = insights?.peak ?? chartData[0];
  const lowest = insights?.lowest ?? chartData[chartData.length - 1];

  if (isLoading) {
    return <div className="widget-state">Calculando consumo medio horario…</div>;
  }

  if (error) {
    return (
      <div className="widget-state widget-state--error">
        <p>{error}</p>
        <button type="button" onClick={fetchDataset}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!chartData.length) {
    return <div className="widget-state">No hay datos de consumo medio disponibles.</div>;
  }

  return (
    <div className="hourly-consumption-widget">
      <div className="hourly-highlight">
        <div>
          <span>Consumo medio diario</span>
          <h3>{formatKwh(dailyAverage)}</h3>
        </div>
        <div className="hourly-peaks">
          <div>
            <small>Hora pico</small>
            <strong>{formatHourLabel(peak?.hour)}</strong>
            <span>{formatKwh(peak?.averageConsumption)}</span>
          </div>
          <div>
            <small>Hora valle</small>
            <strong>{formatHourLabel(lowest?.hour)}</strong>
            <span>{formatKwh(lowest?.averageConsumption)}</span>
          </div>
        </div>
      </div>
      <div className="hourly-chart">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="consumptionGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 12 }} interval={1} />
            <YAxis
              tick={{ fill: '#475569', fontSize: 12 }}
              tickFormatter={(value) => `${value.toFixed(1)}`}
              domain={[0, 'auto']}
            />
            <Tooltip content={<HourlyTooltip />} />
            <Area
              type="monotone"
              dataKey="averageConsumption"
              stroke="#2563eb"
              fill="url(#consumptionGradient)"
              strokeWidth={3}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
