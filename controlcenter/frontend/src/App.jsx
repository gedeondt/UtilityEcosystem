import { useMemo } from 'react';
import DashboardLayout from './layout/DashboardLayout.jsx';
import DatalakeWidget from './components/DatalakeWidget.jsx';
import WidgetCard from './components/WidgetCard.jsx';
import './App.css';

const widgets = [
  {
    id: 'datalake-file-count',
    title: 'Distribución de ficheros del Datalake',
    description: 'Resumen de ficheros existentes en cada carpeta del lago de datos',
    component: DatalakeWidget,
  },
];

export default function App() {
  const renderedWidgets = useMemo(
    () =>
      widgets.map((widget) => (
        <WidgetCard key={widget.id} title={widget.title} description={widget.description}>
          <widget.component />
        </WidgetCard>
      )),
    []
  );

  return <DashboardLayout>{renderedWidgets}</DashboardLayout>;
}
