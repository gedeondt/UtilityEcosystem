import { useMemo, useState } from 'react';
import DashboardLayout from './layout/DashboardLayout.jsx';
import DatalakeWidget from './components/DatalakeWidget.jsx';
import EventLogWidget from './components/EventLogWidget.jsx';
import HourlyConsumptionWidget from './components/HourlyConsumptionWidget.jsx';
import WidgetCard from './components/WidgetCard.jsx';
import './App.css';

const dashboardPages = [
  {
    id: 'technical-data',
    label: 'Datos técnicos',
    headerTitle: 'Datos técnicos',
    headerDescription:
      'Monitorea los ficheros del datalake y el volumen de eventos registrados en el ecosistema.',
    widgets: [
      {
        id: 'eventlog-channel-count',
        title: 'Eventos por canal del Event Log',
        description: 'Número de eventos almacenados por cada canal del servicio Event Log',
        component: EventLogWidget,
      },
      {
        id: 'datalake-file-count',
        title: 'Distribución de ficheros del Datalake',
        description: 'Resumen de ficheros existentes en cada carpeta del lago de datos',
        component: DatalakeWidget,
      },
    ],
  },
  {
    id: 'data-marts',
    label: 'Data marts',
    headerTitle: 'Data marts',
    headerDescription:
      'Consulta las métricas agregadas que generamos en la capa gold, como el consumo medio por hora.',
    widgets: [
      {
        id: 'hourly-consumption',
        title: 'Consumo medio de clientes por hora',
        description: 'Promedio de kWh consumidos por la base de clientes a lo largo del día',
        component: HourlyConsumptionWidget,
      },
    ],
  },
];

export default function App() {
  const [activePageId, setActivePageId] = useState(dashboardPages[0].id);

  const activePage = useMemo(
    () => dashboardPages.find((page) => page.id === activePageId) ?? dashboardPages[0],
    [activePageId]
  );

  const renderedWidgets = useMemo(
    () =>
      activePage.widgets.map((widget) => (
        <WidgetCard key={widget.id} title={widget.title} description={widget.description}>
          <widget.component />
        </WidgetCard>
      )),
    [activePage]
  );

  return (
    <DashboardLayout
      pages={dashboardPages}
      activePageId={activePage.id}
      onSelectPage={setActivePageId}
      headerTitle={activePage.headerTitle}
      headerDescription={activePage.headerDescription}
    >
      {renderedWidgets}
    </DashboardLayout>
  );
}
