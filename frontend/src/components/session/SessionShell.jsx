import { Suspense, useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import StatusBanner from "../StatusBanner";
import {
  SESSION_SECTIONS,
  SESSION_STAGE_META,
  getNextSessionSection,
  getSessionJourneyPercent,
  getSessionSection,
  getSessionSectionFromPathname,
  getSessionSectionState,
} from "../../config/sessionSections";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";
import SessionSectionFallback from "./SessionSectionFallback";
import SessionSidebar from "./SessionSidebar";
import { badgeClass } from "./sessionUi";

function getSessionTabClass({ isActive, isVisited }) {
  let className = "session-tab";

  if (isActive) {
    className += " session-tab--active";
  }

  if (isVisited) {
    className += " session-tab--visited";
  }

  return className;
}

function SessionStateCard({ title, description, children }) {
  return (
    <section className="surface-card session-state-card">
      <div className="content-stack">
        <div>
          <span className="eyebrow">Session State</span>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
        {children ? <div className="inline-actions">{children}</div> : null}
      </div>
    </section>
  );
}

export default function SessionShell({
  routeSessionId,
  invalidSessionId = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const sectionViewportRef = useRef(null);
  const hasMountedSectionRef = useRef(false);
  const {
    activeLabConfig,
    activeLabDefinition,
    sessionId,
    sessionRecord,
    message,
    clearMessage,
    sessionSyncing,
    sessionLoadError,
    startingSession,
    launchingLab,
    tearingDownLab,
    resettingLab,
    endingSession,
    generatingReport,
    summary,
    workflow,
    startNewSession,
    launchActiveLab,
    teardownActiveLab,
    resetActiveLab,
    endCurrentSession,
    generateSessionReport,
    recordVisitedSection,
  } = useSecureStack();

  async function handleStartFreshSession() {
    try {
      const result = await startNewSession(activeLabConfig.labId);
      if (result?.id) {
        navigate(buildSessionPath(result.id));
      }
    } catch {
      // Message state is handled in shared context.
    }
  }

  async function handleLaunch() {
    try {
      await launchActiveLab();
    } catch {
      // Message state is handled in shared context.
    }
  }

  async function handleGenerateReport() {
    try {
      await generateSessionReport();
    } catch {
      // Message state is handled in shared context.
    }
  }

  async function handleResetEnvironment() {
    try {
      await resetActiveLab();
    } catch {
      // Message state is handled in shared context.
    }
  }

  async function handleTeardownEnvironment() {
    try {
      await teardownActiveLab();
    } catch {
      // Message state is handled in shared context.
    }
  }

  async function handleEndSession() {
    try {
      await endCurrentSession();
      navigate("/profile");
    } catch {
      // Message state is handled in shared context.
    }
  }

  const isSwitchingSession =
    Boolean(routeSessionId) && Boolean(sessionId) && routeSessionId !== sessionId;
  const isRouteLoading = Boolean(routeSessionId) && (sessionSyncing || isSwitchingSession);
  const currentSessionId = routeSessionId || sessionId;
  const currentSection = getSessionSectionFromPathname(location.pathname);
  const nextSection = getNextSessionSection(currentSection.slug);
  const sessionCompleted = Boolean(
    sessionRecord?.status === "completed" || sessionRecord?.end_time
  );
  const recommendedSection = workflow.nextRecommendation?.targetSection
    ? getSessionSection(workflow.nextRecommendation.targetSection)
    : nextSection;
  const journeyPercent = getSessionJourneyPercent(currentSection.slug);
  const launchButtonClass =
    workflow.nextRecommendation.key === "launch_environment"
      ? "button button--primary"
      : "button button--secondary";
  const reportButtonClass =
    workflow.nextRecommendation.key === "generate_report"
      ? "button button--primary"
      : "button button--secondary";

  useEffect(() => {
    if (!currentSessionId || invalidSessionId) {
      return;
    }

    if (!hasMountedSectionRef.current) {
      hasMountedSectionRef.current = true;
      return;
    }

    sectionViewportRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [currentSessionId, invalidSessionId, location.pathname]);

  useEffect(() => {
    if (!currentSessionId || invalidSessionId) {
      return;
    }

    recordVisitedSection(currentSection.slug);
  }, [
    currentSection.slug,
    currentSessionId,
    invalidSessionId,
    recordVisitedSection,
  ]);

  return (
    <div className="page-stack">
      <section className="hero hero--session">
        <div className="hero__content">
          <div className="hero__eyebrow">Session Workspace</div>
          <h1>{activeLabDefinition?.name || activeLabConfig.name}</h1>
          <p>
            Work through the live lab, switch between guide and reports without
            leaving the session, and keep the workflow visible at every step.
          </p>
        </div>

        <div className="hero__panel">
          <div className="hero__metric">
            <span>Session</span>
            <strong>{currentSessionId ? `#${currentSessionId}` : "Not started"}</strong>
          </div>
          <div className="hero__metric">
            <span>Progress</span>
            <strong>{summary.progressPercent}% complete</strong>
          </div>
          <div className="hero__metric">
            <span>Status</span>
            <strong>{sessionLoadError ? "Needs attention" : workflow.status.label}</strong>
          </div>
        </div>
      </section>

      <section className="surface-card session-shell">
        <div className="session-shell__topbar">
          <div className="session-shell__status">
            <span className={badgeClass(sessionLoadError ? "danger" : "success")}>
              {sessionLoadError ? "Session error" : `Session #${currentSessionId || "?"}`}
            </span>
            {sessionCompleted ? (
              <span className={badgeClass("muted")}>Session completed</span>
            ) : null}
            <span
              className={badgeClass(
                workflow.environmentLaunched ? "success" : "muted"
              )}
            >
              {workflow.environmentLaunched
                ? "Environment live"
                : sessionCompleted
                ? "Environment cleaned up"
                : "Not launched"}
            </span>
            {summary.activeLabStep ? (
              <span className={badgeClass("info")}>
                Current task: {workflow.currentTaskLabel}
              </span>
            ) : null}
          </div>

          <div className="action-strip">
            <button
              type="button"
              className="button button--ghost"
              onClick={handleStartFreshSession}
              disabled={startingSession}
            >
              {startingSession ? "Starting..." : "Start Session"}
            </button>
            <button
              type="button"
              className={launchButtonClass}
              onClick={handleLaunch}
              disabled={!currentSessionId || launchingLab || sessionCompleted}
            >
              {launchingLab ? "Launching..." : "Launch Environment"}
            </button>
            {workflow.environmentLaunched && !sessionCompleted ? (
              <button
                type="button"
                className="button button--ghost"
                onClick={handleTeardownEnvironment}
                disabled={!currentSessionId || tearingDownLab || resettingLab}
              >
                {tearingDownLab && !resettingLab
                  ? "Cleaning up..."
                  : "Clean Up Environment"}
              </button>
            ) : null}
            {workflow.environmentLaunched && !sessionCompleted ? (
              <button
                type="button"
                className="button button--ghost"
                onClick={handleResetEnvironment}
                disabled={!currentSessionId || resettingLab || tearingDownLab}
              >
                {resettingLab || tearingDownLab
                  ? "Resetting..."
                  : "Reset Environment"}
              </button>
            ) : null}
            <button
              type="button"
              className={reportButtonClass}
              onClick={handleGenerateReport}
              disabled={!currentSessionId || generatingReport}
            >
              {generatingReport ? "Generating..." : "Generate Report"}
            </button>
            {!sessionCompleted && currentSessionId ? (
              <button
                type="button"
                className="button button--ghost"
                onClick={handleEndSession}
                disabled={endingSession}
              >
                {endingSession ? "Ending..." : "End Session"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="session-journey">
          <div className="session-journey__header">
            <div className="content-stack">
              <div>
                <span className="eyebrow">Mini Lab Guide</span>
                <h2>
                  Step {currentSection.step}: {currentSection.label}
                </h2>
              </div>
              <p className="section-lead">
                Use this guide to move through the lab in order. Each section
                explains what this part of the exercise is for and where to go
                when you are ready for the next stage.
              </p>
              <div className="session-guide-note">
                <span className={badgeClass("info")}>{currentSection.phase}</span>
                <p>{currentSection.description}</p>
              </div>
            </div>

            <div className="session-journey__summary">
              <div className="tag-row">
                <span className={badgeClass(workflow.status.tone)}>
                  {workflow.status.label}
                </span>
                <span className={badgeClass("success")}>
                  {workflow.completedMilestones}/{workflow.milestones.length} milestones complete
                </span>
              </div>
              <strong>Recommended action: {workflow.nextRecommendation.label}</strong>
              <p>{workflow.nextRecommendation.description}</p>
              <div className="session-journey__next">
                <span className="detail-label">Recommended next section</span>
                <p>
                  {recommendedSection
                    ? `${recommendedSection.label}: ${recommendedSection.description}`
                    : "Reports is the final review space for packaging the strongest evidence into a session summary."}
                </p>
              </div>
            </div>
          </div>

          <div className="progress-bar" aria-hidden="true">
            <div
              className="progress-bar__fill"
              style={{ width: `${journeyPercent}%` }}
            />
          </div>
          <p className="session-guide-progress">
            Workflow progress: {workflow.workflowPercent}% complete across{" "}
            {workflow.milestones.length} milestones. {workflow.status.detail}
          </p>
        </div>

        <nav className="session-subnav" aria-label="Mini lab guide sections">
          {SESSION_SECTIONS.map((section) => {
            const stageMeta =
              SESSION_STAGE_META[
                getSessionSectionState(section.slug, currentSection.slug)
              ];
            const isVisited = workflow.visitedSections.includes(section.slug);

            return (
              <NavLink
                key={section.slug}
                to={section.slug}
                className={({ isActive }) =>
                  getSessionTabClass({ isActive, isVisited })
                }
              >
                <span className="session-tab__step">
                  Lab Step {section.step} - {section.phase}
                </span>
                <span className="session-tab__label">{section.label}</span>
                <div className="session-tab__meta">
                  <span
                    className={`${badgeClass(stageMeta.tone)} session-tab__state`}
                  >
                    {stageMeta.label}
                  </span>
                  {isVisited ? (
                    <span className={badgeClass("success")}>Reviewed</span>
                  ) : null}
                </div>
                <span className="session-tab__description">
                  {section.description}
                </span>
              </NavLink>
            );
          })}
        </nav>

        <StatusBanner message={message} onDismiss={clearMessage} />

        {invalidSessionId ? (
          <SessionStateCard
            title="Invalid session link"
            description="This session URL is not valid. Use a numeric session id or start a fresh session from the labs page."
          >
            <Link className="button button--secondary" to="/labs">
              Browse Labs
            </Link>
            <button
              type="button"
              className="button button--primary"
              onClick={handleStartFreshSession}
              disabled={startingSession}
            >
              {startingSession ? "Starting..." : "Start Session"}
            </button>
          </SessionStateCard>
        ) : isRouteLoading ? (
          <SessionStateCard
            title="Loading session workspace"
            description={`Preparing session ${routeSessionId || currentSessionId} and syncing progress from the backend.`}
          >
            <div className="session-loading-row">
              <div className="skeleton skeleton--title" />
              <div className="skeleton skeleton--body" />
            </div>
          </SessionStateCard>
        ) : sessionLoadError ? (
          <SessionStateCard
            title="Session unavailable"
            description={`The workspace could not load session ${routeSessionId || currentSessionId}. Start a new session or return to the lab catalog.`}
          >
            <button
              type="button"
              className="button button--primary"
              onClick={handleStartFreshSession}
              disabled={startingSession}
            >
              {startingSession ? "Starting..." : "Start Session"}
            </button>
            <Link className="button button--ghost" to="/labs">
              Back to Labs
            </Link>
          </SessionStateCard>
        ) : !currentSessionId ? (
          <SessionStateCard
            title="No active session"
            description="Start a new session to open the workspace, launch the environment, and begin the guided lab."
          >
            <button
              type="button"
              className="button button--primary"
              onClick={handleStartFreshSession}
              disabled={startingSession}
            >
              {startingSession ? "Starting..." : "Start Session"}
            </button>
            <Link className="button button--ghost" to="/labs">
              Browse Labs
            </Link>
          </SessionStateCard>
        ) : (
          <div className="session-shell__body">
            <div ref={sectionViewportRef} className="session-shell__main">
              <div key={location.pathname} className="session-panel-stage">
                <Suspense fallback={<SessionSectionFallback />}>
                  <Outlet />
                </Suspense>
              </div>
            </div>

            <aside className="session-shell__rail">
              <SessionSidebar visitedSections={workflow.visitedSections} />
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
