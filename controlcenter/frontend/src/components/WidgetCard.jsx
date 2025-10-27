import PropTypes from 'prop-types';
import './WidgetCard.css';

export default function WidgetCard({ title, description, children }) {
  return (
    <article className="widget-card">
      <header className="widget-card__header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <span className="widget-card__badge">Tiempo real</span>
      </header>
      <div className="widget-card__content">{children}</div>
    </article>
  );
}

WidgetCard.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  children: PropTypes.node,
};
