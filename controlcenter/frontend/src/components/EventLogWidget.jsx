import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiBaseUrl } from '../utils/api.js';
import './EventLogWidget.css';

const REFRESH_INTERVAL_MS = 10_000;

export default function EventLogWidget() {
  const [channels, setChannels] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const isFirstLoad = useRef(true);

  const fetchChannels = useCallback(async () => {
    setError(null);

    if (isFirstLoad.current) {
      setIsLoading(true);
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/eventlog/channels`);

      if (!response.ok) {
        throw new Error('No se pudieron cargar los canales');
      }

      const payload = await response.json();
      const fetchedChannels = Array.isArray(payload.channels) ? payload.channels : [];
      setChannels(fetchedChannels);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Error inesperado al cargar los canales');
    } finally {
      isFirstLoad.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
    const intervalId = setInterval(fetchChannels, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchChannels]);

  const totalEvents = useMemo(
    () => channels.reduce((sum, channel) => sum + (channel.fileCount ?? 0), 0),
    [channels]
  );

  const formattedUpdateTime = useMemo(() => {
    if (!lastUpdated) {
      return null;
    }

    return lastUpdated.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [lastUpdated]);

  if (isLoading) {
    return <div className="widget-state">Cargando canales de eventos…</div>;
  }

  if (error) {
    return (
      <div className="widget-state widget-state--error">
        <p>{error}</p>
        <button type="button" onClick={fetchChannels}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!channels.length) {
    return <div className="widget-state">No se encontraron canales con eventos registrados.</div>;
  }

  return (
    <div className="eventlog-widget">
      <div className="eventlog-summary">
        <div>
          <h3>{totalEvents.toLocaleString('es-ES')}</h3>
          <p>Eventos registrados</p>
        </div>
        <span>{channels.length} canales</span>
      </div>
      <div className="eventlog-updated">
        <span>
          Última actualización
          {formattedUpdateTime ? `: ${formattedUpdateTime}` : ''}
        </span>
        <button type="button" onClick={fetchChannels}>
          Actualizar ahora
        </button>
      </div>
      <ul className="eventlog-list">
        {channels.map((channel) => (
          <li key={channel.name}>
            <div className="eventlog-channel">
              <span>{channel.name}</span>
              <span>{channel.fileCount === 1 ? '1 evento' : `${channel.fileCount} eventos`}</span>
            </div>
            <span className="eventlog-count">{channel.fileCount.toLocaleString('es-ES')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
