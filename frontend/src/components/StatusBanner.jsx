export default function StatusBanner({ message, tone = "info", onDismiss }) {
  if (!message) {
    return null;
  }

  return (
    <div className={`status-banner status-banner--${tone}`}>
      <span>{message}</span>
      {onDismiss ? (
        <button
          type="button"
          className="status-banner__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}
