import PropTypes from 'prop-types';
import './DashboardLayout.css';

export default function DashboardLayout({ children }) {
  return (
    <div className="dashboard-container">
      <aside className="dashboard-sidebar">
        <div className="sidebar-title">Control Center</div>
        <nav className="sidebar-nav">
          <a href="#" className="sidebar-link active">
            Panel principal
          </a>
          <a href="#" className="sidebar-link">
            Métricas
          </a>
          <a href="#" className="sidebar-link">
            Configuración
          </a>
        </nav>
      </aside>
      <main className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <h1>Panel de control</h1>
            <p>Monitorea el estado del ecosistema de utilidades y el datalake.</p>
          </div>
          <div className="header-actions">
            <button type="button" className="primary-btn">
              Actualizar datos
            </button>
          </div>
        </header>
        <section className="dashboard-grid">{children}</section>
      </main>
    </div>
  );
}

DashboardLayout.propTypes = {
  children: PropTypes.node,
};
