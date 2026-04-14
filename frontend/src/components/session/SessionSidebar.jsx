import { Link, useLocation } from "react-router-dom";
import {
  SESSION_SECTIONS,
  getNextSessionSection,
  getPreviousSessionSection,
  getSessionJourneyPercent,
  getSessionSectionFromPathname,
} from "../../config/sessionSections";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";
import { badgeClass, getFindingSeverityTone } from "./sessionUi";

export default function SessionSidebar({ visitedSections = [] }) {
  const location = useLocation();
  const {
    activeLabConfig,
    activeLabDefinition,
    sessionId,
    findingSuggestion,
    summary,
    acceptingSuggestion,
    acceptSuggestedFinding,
    dismissSuggestedFinding,
  } = useSecureStack();
  const currentSection = getSessionSectionFromPathname(location.pathname);
  const previousSection = getPreviousSessionSection(currentSection.slug);
  const nextSection = getNextSessionSection(currentSection.slug);
  const journeyPercent = getSessionJourneyPercent(currentSection.slug);

  let nextMoveCopy =
    "Use the current section to stay oriented, then continue to the next stage when you are ready.";

  if (currentSection.slug === "overview") {
    nextMoveCopy =
      "Review the task and runtime context here, then open the guide before you move into the live workspace.";
  } else if (currentSection.slug === "guide") {
    nextMoveCopy =
      "Once the current step makes sense, switch into the workspace to validate it and gather the evidence you want to keep.";
  } else if (currentSection.slug === "workspace") {
    nextMoveCopy = summary.sortedFindings.length
      ? "You already have findings saved. Keep testing here or move to reports to package the strongest evidence."
      : "Use the terminal to validate the current step, then move to reports once you have evidence worth saving.";
  } else if (currentSection.slug === "reports") {
    nextMoveCopy = summary.sortedFindings.length
      ? "Review the captured findings, generate the report, and return to the workspace only if you need more proof."
      : "Reports become useful after the workspace produces evidence. Return to the terminal or guide if you still need material.";
  }

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
            <span className="detail-label">Visited sections</span>
            <p>
              {visitedSections.length} of {SESSION_SECTIONS.length} session
              sections reviewed in this run.
            </p>
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
            <span className="detail-label">What this section is for</span>
            <p>
              {currentSection.description}
            </p>
          </div>
          <div className="detail-box detail-box--tertiary">
            <span className="detail-label">Recommended next section</span>
            <p>
              {nextSection
                ? `${nextSection.label}: ${nextSection.description}`
                : "Reports is the final review space for capturing evidence and generating the session summary."}
            </p>
          </div>
          <div className="detail-box detail-box--tertiary">
            <span className="detail-label">What to do next</span>
            <p>{nextMoveCopy}</p>
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
              to={buildSessionPath(
                sessionId,
                nextSection ? nextSection.slug : "workspace"
              )}
            >
              {nextSection
                ? `Continue to ${nextSection.label}`
                : "Return to Workspace"}
            </Link>
          </div>
        </div>
      </section>

      {findingSuggestion ? (
        <section className="surface-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">AI Finding</span>
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
