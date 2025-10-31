import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { getApiBaseUrl } from '../utils/api.js';
import './CustomersByProductWidget.css';

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '–';
  }

  return value.toLocaleString('es-ES');
}

function formatPrice(value) {
  if (!Number.isFinite(value)) {
    return '–';
  }

  return `${value.toFixed(4)} €/kWh`;
}

function formatFee(value) {
  if (!Number.isFinite(value)) {
    return '–';
  }

  return `${value.toFixed(2)} €/mes`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export default function CustomersByProductWidget() {
  const [dataset, setDataset] = useState({ rows: [], summary: null, generatedAt: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDataset = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/datalake/gold/customers-by-product`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Todavía no se ha generado el dataset de clientes por producto.');
        }

        throw new Error('No se pudo consultar el dataset de clientes por producto.');
      }

      const payload = await response.json();
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      setDataset({
        rows,
        summary: payload.summary ?? null,
        generatedAt: payload.generatedAt ?? null,
      });
    } catch (err) {
      setError(err.message || 'Error inesperado al cargar el dataset.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDataset();
  }, [fetchDataset]);

  const chartData = useMemo(() => {
    return dataset.rows
      .map((row) => {
        const productId = row.productId ?? row.product_id ?? row.PRODUCT_ID ?? row.productName;
        const productName = row.productName ?? row.product_name ?? row.PRODUCT_NAME ?? row.productId;
        const clientCountRaw = Number(row.clientCount ?? row.client_count ?? row.CLIENT_COUNT);
        const activeContractCountRaw = Number(
          row.activeContractCount ?? row.active_contract_count ?? row.ACTIVE_CONTRACT_COUNT
        );
        const contractCountRaw = Number(row.contractCount ?? row.contract_count ?? row.CONTRACT_COUNT);

        return {
          productId,
          productName,
          clientCount: Number.isFinite(clientCountRaw) ? clientCountRaw : 0,
          activeContractCount: Number.isFinite(activeContractCountRaw) ? activeContractCountRaw : 0,
          contractCount: Number.isFinite(contractCountRaw) ? contractCountRaw : 0,
          averagePricePerKwh: Number(
            row.averagePricePerKwh ?? row.average_price_per_kwh ?? row.AVERAGE_PRICE_PER_KWH
          ),
          averageFixedFeeEurMonth: Number(
            row.averageFixedFeeEurMonth ??
              row.average_fixed_fee_eur_month ??
              row.AVERAGE_FIXED_FEE_EUR_MONTH
          ),
        };
      })
      .filter((row) => row.productName)
      .sort((a, b) => {
        if (b.clientCount !== a.clientCount) {
          return b.clientCount - a.clientCount;
        }
        return a.productName.localeCompare(b.productName, undefined, { sensitivity: 'base' });
      });
  }, [dataset.rows]);

  const generatedAtLabel = useMemo(() => formatTimestamp(dataset.generatedAt), [dataset.generatedAt]);

  const summary = dataset.summary ?? {};
  const fallbackClients = chartData.reduce((acc, row) => acc + row.clientCount, 0);
  const fallbackContracts = chartData.reduce((acc, row) => acc + row.contractCount, 0);
  const totalClientsRaw = Number(summary.distinctClients ?? summary.clientCount);
  const totalProductsRaw = Number(summary.totalProducts ?? summary.productCount);
  const totalContractsRaw = Number(summary.totalContracts ?? summary.contractCount);

  const totalClients = Number.isFinite(totalClientsRaw) ? totalClientsRaw : fallbackClients;
  const totalProducts = Number.isFinite(totalProductsRaw) ? totalProductsRaw : chartData.length;
  const totalContracts = Number.isFinite(totalContractsRaw) ? totalContractsRaw : fallbackContracts;

  const topProduct = chartData[0];

  if (isLoading) {
    return <div className="widget-state">Generando mart de clientes por producto…</div>;
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
    return <div className="widget-state">No hay datos de clientes por producto disponibles.</div>;
  }

  return (
    <div className="customers-by-product-widget">
      <div className="customers-overview">
        <div>
          <span>Total de clientes</span>
          <strong>{formatNumber(totalClients)}</strong>
        </div>
        <div>
          <span>Productos activos</span>
          <strong>{formatNumber(totalProducts)}</strong>
        </div>
        <div>
          <span>Contratos asociados</span>
          <strong>{formatNumber(totalContracts)}</strong>
        </div>
      </div>

      {topProduct ? (
        <div className="customers-leader">
          <h4>Producto destacado</h4>
          <p>
            <strong>{topProduct.productName}</strong> concentra{' '}
            <strong>{formatNumber(topProduct.clientCount)}</strong> clientes con{' '}
            {formatNumber(topProduct.activeContractCount)} contratos activos.
          </p>
        </div>
      ) : null}

      <div className="customers-chart">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="productName" tick={{ fill: '#475569', fontSize: 12 }} angle={-15} dy={10} interval={0} height={70} />
            <YAxis tick={{ fill: '#475569', fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              formatter={(value, name) => {
                if (name === 'clientCount') {
                  return [formatNumber(value), 'Clientes'];
                }
                if (name === 'activeContractCount') {
                  return [formatNumber(value), 'Contratos activos'];
                }
                return [formatNumber(value), name];
              }}
              labelFormatter={(label) => label}
              cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
            />
            <Legend formatter={(value) => (value === 'clientCount' ? 'Clientes' : 'Contratos activos')} />
            <Bar dataKey="clientCount" name="Clientes" fill="#2563eb" radius={[6, 6, 0, 0]} />
            <Bar dataKey="activeContractCount" name="Contratos activos" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="customers-breakdown">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Clientes</th>
              <th>Contratos</th>
              <th>Activos</th>
              <th>Precio medio</th>
              <th>Cuota media</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((row) => (
              <tr key={row.productId || row.productName}>
                <td>{row.productName}</td>
                <td>{formatNumber(row.clientCount)}</td>
                <td>{formatNumber(row.contractCount)}</td>
                <td>{formatNumber(row.activeContractCount)}</td>
                <td>{formatPrice(row.averagePricePerKwh)}</td>
                <td>{formatFee(row.averageFixedFeeEurMonth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {generatedAtLabel ? (
        <p className="customers-footnote">
          Actualizado <time dateTime={dataset.generatedAt || undefined}>{generatedAtLabel}</time>
        </p>
      ) : null}
    </div>
  );
}
