import PropTypes from 'prop-types';
import './DashboardLayout.css';

export default function DashboardLayout({
  pages,
  activePageId,
  onSelectPage,
  headerTitle,
  headerDescription,
  children,
}) {
  return (
    <div className="dashboard-container">
      <aside className="dashboard-sidebar">
        <div className="sidebar-title">Control Center</div>
        <nav className="sidebar-nav">
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              className={`sidebar-link ${page.id === activePageId ? 'active' : ''}`}
              onClick={() => onSelectPage(page.id)}
            >
              {page.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <h1>{headerTitle}</h1>
            <p>{headerDescription}</p>
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
  pages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })
  ).isRequired,
  activePageId: PropTypes.string.isRequired,
  onSelectPage: PropTypes.func.isRequired,
  headerTitle: PropTypes.string.isRequired,
  headerDescription: PropTypes.string.isRequired,
  children: PropTypes.node,
};
