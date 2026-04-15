import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";
import {
  aiStatusMeta,
  evidenceQualityMeta,
  taskStatusMeta,
} from "../../utils/session";
import { badgeClass } from "./sessionUi";
import LabTopologyCard from "./LabTopologyCard";

function getStepDisplayStatus({
  index,
  completedSteps,
  currentLabStepIndex,
  stepProgress,
}) {
  if (completedSteps.includes(index)) {
    return "completed";
  }

  if (stepProgress?.status === "off_track") {
    return "off_track";
  }

  if (stepProgress?.status === "attempted") {
    return "attempted";
  }

  if (index === currentLabStepIndex) {
    return "current";
  }

  return "pending";
}

function getGuideHints(step) {
  if (Array.isArray(step?.hints) && step.hints.length) {
    return step.hints;
  }

  if (step?.hint_text) {
    return [step.hint_text];
  }

  return [];
}

export default function SessionGuidePanel() {
  const {
    activeLabDefinition,
    labSteps,
    sessionId,
    taskProgress,
    summary,
    workflow,
    completeBrowserStep,
  } = useSecureStack();
  const [selectedStepIndex, setSelectedStepIndex] = useState(() => {
    if (!labSteps?.length) {
      return 0;
    }

    return Math.min(summary.currentLabStepIndex, labSteps.length - 1);
  });
  const previousActiveIndexRef = useRef(summary.currentLabStepIndex);

  useEffect(() => {
    setSelectedStepIndex((previousIndex) => {
      if (!labSteps?.length) {
        return 0;
      }

      return Math.min(previousIndex, labSteps.length - 1);
    });
  }, [labSteps]);

  useEffect(() => {
    setSelectedStepIndex((previousIndex) => {
      if (!labSteps?.length) {
        return 0;
      }

      const previousActiveIndex = previousActiveIndexRef.current;
      if (
        previousIndex === previousActiveIndex &&
        summary.currentLabStepIndex !== previousActiveIndex &&
        summary.currentLabStepIndex < labSteps.length
      ) {
        return summary.currentLabStepIndex;
      }

      return previousIndex;
    });

    previousActiveIndexRef.current = summary.currentLabStepIndex;
  }, [labSteps, summary.currentLabStepIndex]);

  if (!labSteps?.length) {
    return (
      <div className="page-stack">
        <section className="surface-card guide-panel guide-panel--tertiary">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Lab Guide</span>
              <h2>Guided Workflow</h2>
            </div>
          </div>

          <div className="empty-card">
            <div className="content-stack">
              <strong>Guide steps are still loading</strong>
              <p>
                The walkthrough will appear here once the lab definition is
                ready for this session.
              </p>
              {sessionId ? (
                <div className="inline-actions">
                  <Link
                    className="button button--secondary"
                    to={buildSessionPath(sessionId, "overview")}
                  >
                    Back to Overview
                  </Link>
                  <Link
                    className="button button--primary"
                    to={buildSessionPath(sessionId, "workspace")}
                  >
                    Open Workspace
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    );
  }

  const safeStepIndex = Math.min(selectedStepIndex, labSteps.length - 1);
  const step = labSteps[safeStepIndex];
  const stepProgress = taskProgress[step.task_id];
  const displayStatus = getStepDisplayStatus({
    index: safeStepIndex,
    completedSteps: summary.completedSteps,
    currentLabStepIndex: summary.currentLabStepIndex,
    stepProgress,
  });
  const status = taskStatusMeta[displayStatus];
  const stepAi = stepProgress?.ai_status
    ? aiStatusMeta[stepProgress.ai_status]
    : null;
  const evidence = stepProgress?.evidence_quality
    ? evidenceQualityMeta[stepProgress.evidence_quality]
    : null;
  const guideHints = getGuideHints(step);
  const stepExplanation = step.explanation || step.objective || step.instruction;
  const expectedOutcome =
    step.expected_outcome ||
    step.success_criteria?.[0] ||
    "Capture evidence that proves the step objective was satisfied.";
  const walkthroughPercent = Math.round(
    ((safeStepIndex + 1) / labSteps.length) * 100
  );
  const isViewingCurrentStep = safeStepIndex === summary.currentLabStepIndex;

  return (
    <div className="page-stack">
      <section className="surface-card guide-panel guide-panel--primary">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Lab Guide</span>
            <h2>Guided Lab Manual</h2>
          </div>
          <span className="section-note">
            {activeLabDefinition?.estimated_duration_minutes
              ? `${activeLabDefinition.estimated_duration_minutes} min estimate`
              : "Structured lab walkthrough"}
          </span>
        </div>

        <p className="section-lead">
          Use this guide as the lab manual for the current session. Review the
          lab context, understand the goal of the active step, then take the
          work into the workspace when you are ready to validate it live.
        </p>

        <div className="guide-manual-grid">
          <div className="detail-box detail-box--accent guide-brief-card">
            <span className="detail-label">Lab Overview</span>
            <p>{activeLabDefinition?.description || "The active lab is loading."}</p>

            {activeLabDefinition?.learning_objectives?.length ? (
              <div className="guide-brief-card__stack">
                <span className="detail-label">Learning Objectives</span>
                <ul className="detail-list guide-learning-list">
                  {activeLabDefinition.learning_objectives.map((objective) => (
                    <li key={objective}>{objective}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <LabTopologyCard topology={activeLabDefinition?.topology} />
        </div>

        <div className="progress-bar">
          <div
            className="progress-bar__fill"
            style={{ width: `${walkthroughPercent}%` }}
          />
        </div>
        <p className="progress-copy">
          Step {safeStepIndex + 1} of {labSteps.length}
        </p>

        <div className="guide-traversal">
          <button
            type="button"
            className="button button--ghost guide-arrow"
            onClick={() =>
              setSelectedStepIndex((previousIndex) =>
                Math.max(0, previousIndex - 1)
              )
            }
            disabled={safeStepIndex === 0}
            aria-label="Previous step"
          >
            &lt;
          </button>

          <div className="guide-traversal__summary">
            <span className="guide-traversal__count">
              Step {safeStepIndex + 1} of {labSteps.length}
            </span>
            <h3>{step.title}</h3>
            <div className="tag-row">
              <span className={badgeClass(status.tone)}>{status.label}</span>
              {stepAi ? (
                <span className={badgeClass(stepAi.tone)}>{stepAi.label}</span>
              ) : null}
              {evidence ? (
                <span className={badgeClass(evidence.tone)}>{evidence.label}</span>
              ) : null}
              {isViewingCurrentStep ? (
                <span className={badgeClass("info")}>Current focus</span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className="button button--ghost guide-arrow"
            onClick={() =>
              setSelectedStepIndex((previousIndex) =>
                Math.min(labSteps.length - 1, previousIndex + 1)
              )
            }
            disabled={safeStepIndex === labSteps.length - 1}
            aria-label="Next step"
          >
            &gt;
          </button>
        </div>

        {!isViewingCurrentStep && summary.activeLabStep ? (
          <div className="callout callout--info">
            <strong>Previewing step {safeStepIndex + 1}.</strong> The active
            task in the workflow is step {summary.currentLabStepIndex + 1}:{" "}
            {summary.activeLabStep.title}.
          </div>
        ) : null}
      </section>

      <section className="surface-card guide-panel guide-panel--primary">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Step Details</span>
            <h2>{step.title}</h2>
          </div>
          <span className={badgeClass(status.tone)}>{status.label}</span>
        </div>

        <div className="guide-step-layout">
          <div className="guide-step-main">
            <div className="detail-box detail-box--accent">
              <span className="detail-label">Instruction</span>
              <p>{step.instruction}</p>
            </div>

            <div className="detail-box">
              <span className="detail-label">Explanation</span>
              <p>{stepExplanation}</p>
            </div>

            <div className="detail-box">
              <span className="detail-label">Expected Outcome</span>
              <p>{expectedOutcome}</p>
            </div>

            {step.command_hint ? (
              <div className="guide-command-card">
                <span className="detail-label">Command Hint</span>
                <code className="command-pill">{step.command_hint}</code>
              </div>
            ) : null}

            {stepProgress?.ai_feedback ? (
              <div className="detail-box">
                <span className="detail-label">Task Evaluation</span>
                <p>{stepProgress.ai_feedback}</p>
              </div>
            ) : null}

            {stepProgress?.evidence_command || stepProgress?.ai_confidence ? (
              <div className="detail-box">
                <span className="detail-label">Evidence Review</span>
                {stepProgress?.evidence_command ? (
                  <p>
                    <strong>Command:</strong> {stepProgress.evidence_command}
                  </p>
                ) : null}
                {stepProgress?.ai_confidence ? (
                  <p>
                    <strong>Confidence:</strong> {stepProgress.ai_confidence}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="guide-step-side">
            {guideHints.length ? (
              <div className="detail-box">
                <span className="detail-label">Hints</span>
                <div className="guide-hint-list">
                  {guideHints.map((hint, index) => (
                    <details
                      key={`${step.task_id}-hint-${index}`}
                      className="guide-hint"
                    >
                      <summary>Hint {index + 1}</summary>
                      <p>{hint}</p>
                    </details>
                  ))}
                </div>
              </div>
            ) : null}

            {step.expected_evidence?.length ? (
              <div className="detail-box">
                <span className="detail-label">Look For</span>
                <ul className="detail-list">
                  {step.expected_evidence.map((evidenceItem) => (
                    <li key={evidenceItem}>{evidenceItem}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {step.remediation_text ? (
              <div className="detail-box">
                <span className="detail-label">Remediation Guidance</span>
                <p>{step.remediation_text}</p>
              </div>
            ) : null}

            {step.success_criteria?.length ? (
              <div className="detail-box">
                <span className="detail-label">Success Criteria</span>
                <ul className="detail-list">
                  {step.success_criteria.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        {isViewingCurrentStep && step.step_type === "browser" ? (
          <div className="inline-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={completeBrowserStep}
            >
              {step.manual_confirmation_label || "Mark Browser Step Complete"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="surface-card guide-panel guide-panel--tertiary">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Next Move</span>
            <h2>Take This Step Into the Workspace</h2>
          </div>
        </div>

        <p className="section-lead">{workflow.nextRecommendation.description}</p>

        <div className="detail-box detail-box--tertiary">
          <span className="detail-label">Workflow recommendation</span>
          <p>{workflow.nextRecommendation.reason}</p>
        </div>

        <div className="session-cta-row">
          <Link
            className="button button--ghost"
            to={buildSessionPath(sessionId, "overview")}
          >
            Review Overview
          </Link>
          <Link
            className="button button--primary"
            to={buildSessionPath(sessionId, "workspace")}
          >
            Open Workspace
          </Link>
          {summary.sortedFindings.length ? (
            <Link
              className="button button--secondary"
              to={buildSessionPath(sessionId, "reports")}
            >
              Open Reports
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}
