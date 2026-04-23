import { Link, useLocation } from "react-router-dom";
import {
  SESSION_SECTIONS,
  getPreviousSessionSection,
  getSessionJourneyPercent,
  getSessionSection,
  getSessionSectionFromPathname,
} from "../../config/sessionSections";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";
import { badgeClass, getFindingSeverityTone } from "./sessionUi";
import { getSectionNavigationLabel } from "../../utils/workflow";

export default function SessionSidebar({ visitedSections = [] }) {
  const location = useLocation();
  const {
    activeLabConfig,
    activeLabDefinition,
    sessionId,
    findingSuggestion,
    workflow,
    acceptingSuggestion,
    acceptSuggestedFinding,
    dismissSuggestedFinding,
  } = useSecureStack();
  const currentSection = getSessionSectionFromPathname(location.pathname);
  const previousSection = getPreviousSessionSection(currentSection.slug);
  const recommendedSection = workflow.nextRecommendation?.targetSection
    ? getSessionSection(workflow.nextRecommendation.targetSection)
    : null;
  const navigationTarget = recommendedSection?.slug || "workspace";
  const navigationLabel = getSectionNavigationLabel(navigationTarget);
  const journeyPercent = getSessionJourneyPercent(currentSection.slug);

  async function handleAcceptFinding() {
    try {
      await acceptSuggestedFinding();
    } catch {
      // Message state is handled in shared context.
    }
  }

  return (
    <div className="session-sidebar">
      <section className="surface-card session-sidebar__guide">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mini Lab Guide</span>
            <h2>Stay Oriented</h2>
          </div>
          <span className={badgeClass("info")}>
            Guide step {currentSection.step}/{SESSION_SECTIONS.length}
          </span>
        </div>

        <div className="content-stack">
          <div className="progress-bar" aria-hidden="true">
            <div
              className="progress-bar__fill"
              style={{ width: `${journeyPercent}%` }}
            />
          </div>
          <div className="detail-box detail-box--tertiary">
            <span className="detail-label">Current focus</span>
            <p>{workflow.currentTaskLabel}</p>
          </div>
          <div className="detail-box detail-box--tertiary">
            <span className="detail-label">What to do next</span>
            <p>
              <strong>{workflow.nextRecommendation.label}:</strong>{" "}
              {workflow.nextRecommendation.description}
            </p>
          </div>
          <div className="detail-box detail-box--tertiary">
            <span className="detail-label">Why this section matters</span>
            <p>{currentSection.description}</p>
          </div>
          <div className="inline-actions">
            {previousSection ? (
              <Link
                className="button button--ghost"
                to={buildSessionPath(sessionId, previousSection.slug)}
              >
                Review {previousSection.label}
              </Link>
            ) : null}
            <Link
              className="button button--secondary"
              to={buildSessionPath(sessionId, navigationTarget)}
            >
              {navigationLabel}
            </Link>
          </div>

          <details className="session-sidebar__details">
            <summary>Session details</summary>
            <div className="content-stack">
              <div className="detail-box detail-box--tertiary">
                <span className="detail-label">Visited sections</span>
                <p>
                  {visitedSections.length} of {SESSION_SECTIONS.length} session
                  sections reviewed in this run.
                </p>
              </div>
              <div className="detail-box detail-box--tertiary">
                <span className="detail-label">Lab state</span>
                <p>{workflow.status.detail}</p>
              </div>
              <div className="detail-box detail-box--tertiary">
                <span className="detail-label">Active lab</span>
                <p>{activeLabDefinition?.name || activeLabConfig.name}</p>
              </div>
              <div className="detail-box detail-box--tertiary">
                <span className="detail-label">Current section</span>
                <p>
                  {currentSection.label} ({currentSection.phase})
                </p>
              </div>
              <div className="detail-box detail-box--tertiary">
                <span className="detail-label">Recommended next section</span>
                <p>
                  {recommendedSection
                    ? `${recommendedSection.label}: ${recommendedSection.description}`
                    : "Reports is the final review space for capturing evidence and generating the session summary."}
                </p>
              </div>
              <div className="detail-box detail-box--tertiary">
                <span className="detail-label">Live session activity</span>
                <p>
                  {workflow.hasCommandActivity
                    ? `${workflow.commandsRunCount} commands captured${workflow.lastCommand ? `, latest: ${workflow.lastCommand}` : "."}`
                    : "No command activity captured yet."}
                </p>
              </div>
              <div className="detail-box detail-box--tertiary">
                <span className="detail-label">Evidence and report</span>
                <p>{workflow.reportReadiness.detail}</p>
              </div>
            </div>
          </details>
        </div>
      </section>

      {findingSuggestion ? (
        <section className="surface-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Tutor Finding</span>
              <h2>Suggested Finding</h2>
            </div>
            <span
              className={badgeClass(
                getFindingSeverityTone(findingSuggestion.severity)
              )}
            >
              {findingSuggestion.severity || "Medium"}
            </span>
          </div>

          <div className="content-stack">
            <div className="detail-box">
              <span className="detail-label">Title</span>
              <p>{findingSuggestion.title || "Untitled finding"}</p>
            </div>
            <div className="detail-box">
              <span className="detail-label">Description</span>
              <p>
                {findingSuggestion.description || "No description available."}
              </p>
            </div>
            <div className="detail-box">
              <span className="detail-label">Evidence</span>
              <pre className="terminal-evidence">
                {findingSuggestion.evidence || "No evidence provided."}
              </pre>
            </div>
            <div className="inline-actions">
              <button
                type="button"
                className="button button--primary"
                onClick={handleAcceptFinding}
                disabled={!sessionId || acceptingSuggestion}
              >
                {acceptingSuggestion ? "Saving..." : "Accept Finding"}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={dismissSuggestedFinding}
                disabled={acceptingSuggestion}
              >
                Dismiss
              </button>
            </div>
            {sessionId ? (
              <Link
                className="button button--ghost"
                to={buildSessionPath(sessionId, "reports")}
              >
                Open Reports
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
