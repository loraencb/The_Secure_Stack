import { useNavigate } from "react-router-dom";
import LabCard from "../components/LabCard";
import StatusBanner from "../components/StatusBanner";
import { useSecureStack } from "../context/SecureStackContext";
import { buildSessionPath } from "../utils/routes";

export default function LabsPage() {
  const navigate = useNavigate();
  const {
    activeLabId,
    sessionId,
    message,
    clearMessage,
    labCatalog,
    labCatalogLoading,
    labCatalogError,
    selectLab,
    startNewSession,
  } = useSecureStack();

  async function handleStart(labId) {
    selectLab(labId);

    if (sessionId && activeLabId === labId) {
      navigate(buildSessionPath(sessionId, "workspace"));
      return;
    }

    try {
      const result = await startNewSession(labId);
      if (result?.id) {
        navigate(buildSessionPath(result.id, "workspace"));
      }
    } catch {
      // Message state is handled in shared context.
    }
  }

  return (
    <div className="page-stack">
      <section className="page-header page-header--single">
        <div>
          <span className="eyebrow">Lab Catalog</span>
          <h1>Choose a guided lab and launch the session workspace.</h1>
          <p>
            Each lab card reflects the structured module definition, so the
            catalog, guide, workspace, and reports stay aligned.
          </p>
          {sessionId ? (
            <div className="page-header__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => navigate(buildSessionPath(sessionId, "workspace"))}
              >
                Resume Session
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <StatusBanner
        message={labCatalogError || message}
        tone={labCatalogError ? "warning" : "info"}
        onDismiss={labCatalogError ? undefined : clearMessage}
      />

      {labCatalogLoading ? (
        <div className="panel-grid panel-grid--labs">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="surface-card skeleton-card">
              <div className="skeleton skeleton--title" />
              <div className="skeleton skeleton--body" />
              <div className="skeleton skeleton--body" />
              <div className="skeleton skeleton--button" />
            </div>
          ))}
        </div>
      ) : labCatalog.length ? (
        <div className="panel-grid panel-grid--labs">
          {labCatalog.map((lab) => (
            <LabCard
              key={lab.labId}
              lab={lab}
              isSelected={activeLabId === lab.labId}
              isActiveSession={Boolean(sessionId && activeLabId === lab.labId)}
              onSelect={selectLab}
              onStart={handleStart}
            />
          ))}
        </div>
      ) : (
        <div className="empty-card empty-card--centered">
          <strong>No labs loaded yet</strong>
          <p>
            Guided labs will appear here once the catalog is available.
          </p>
        </div>
      )}
    </div>
  );
}
