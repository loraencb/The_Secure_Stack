import { Link } from "react-router-dom";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";
import { riskMeta, severityMeta } from "../../utils/session";
import { buildFindingContent } from "../../utils/findings";
import { badgeClass } from "./sessionUi";

function getFindingSeverityClass(severity = "Medium") {
  return `finding-card--severity-${severity.toLowerCase()}`;
}

function renderFindingBlock(label, value, className = "") {
  if (!value) {
    return null;
  }

  return {
    label,
    value,
    className,
  };
}

export default function SessionReportsPanel() {
  const {
    report,
    generatingReport,
    findings,
    sessionId,
    findingForm,
    savingFinding,
    summary,
    workflow,
    updateFindingForm,
    applyEvidenceFindingDraft,
    saveFinding,
    generateSessionReport,
  } = useSecureStack();

  async function handleGenerateReport() {
    try {
      await generateSessionReport();
    } catch {
      // Message state is handled in shared context.
    }
  }

  const highSeverityCount = findings.filter(
    (finding) => finding.severity === "High"
  ).length;
  const evidenceStats = workflow.findingEvidenceStats;
  const evidenceContext = workflow.evidenceContext;

  return (
    <div className="page-stack">
      <section className="surface-card reports-panel reports-panel--composer">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Session Results</span>
            <h2>Findings And Report</h2>
          </div>
          <span className={badgeClass(workflow.reportReadiness.tone)}>
            {workflow.reportReadiness.label}
          </span>
        </div>

        <p className="section-lead">
          {workflow.reportReadiness.detail}
        </p>

        <div className="reports-summary-grid">
          <div className="stat-card">
            <span>Saved findings</span>
            <strong>{findings.length}</strong>
          </div>
          <div className="stat-card">
            <span>Evidence-backed</span>
            <strong>{evidenceStats.evidenceBackedCount}</strong>
          </div>
          <div className="stat-card">
            <span>Task-linked</span>
            <strong>{evidenceStats.taskLinkedCount}</strong>
          </div>
          <div className="stat-card">
            <span>Report</span>
            <strong>{workflow.reportGenerated ? "Ready" : "Not generated"}</strong>
          </div>
        </div>

        <div className="panel-grid panel-grid--double">
          <div className="detail-box detail-box--tertiary">
            <span className="detail-label">Linked task</span>
            <p>{evidenceContext.taskContext || workflow.currentTaskLabel}</p>
          </div>
          <div className="detail-box detail-box--tertiary">
            <span className="detail-label">Task objective</span>
            <p>
              {evidenceContext.taskObjective ||
                "The active task objective will appear here once the lab has enough context."}
            </p>
          </div>
          <div className="detail-box detail-box--tertiary">
            <span className="detail-label">Recent command evidence</span>
            <p>
              {evidenceContext.recentCommand ||
                "No recent command is linked to this reporting flow yet."}
            </p>
          </div>
          <div className="detail-box detail-box--tertiary">
            <span className="detail-label">Readiness cue</span>
            <p>{evidenceContext.readiness.detail}</p>
          </div>
        </div>

        <div className="session-cta-row">
          <Link
            className="button button--secondary"
            to={buildSessionPath(sessionId, "workspace")}
          >
            Return to Workspace
          </Link>
          <Link
            className="button button--ghost"
            to={buildSessionPath(sessionId, "guide")}
          >
            Review Guide
          </Link>
          <button
            type="button"
            className="button button--primary"
            onClick={handleGenerateReport}
            disabled={generatingReport}
          >
            {generatingReport ? "Generating..." : "Generate Report"}
          </button>
        </div>

        <div className="reports-composer">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Capture Finding</span>
              <h3>Save Evidence While It Is Fresh</h3>
            </div>
            <span className={badgeClass(evidenceContext.readiness.tone)}>
              {savingFinding
                ? "Saving entry..."
                : evidenceContext.readiness.label}
            </span>
          </div>

          <div className="detail-box detail-box--accent report-draft-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Evidence Draft</span>
                <h3>{evidenceContext.draftTitle}</h3>
              </div>
              <span className={badgeClass(evidenceContext.readiness.tone)}>
                {evidenceContext.readiness.label}
              </span>
            </div>

            <p className="section-lead">{evidenceContext.readiness.detail}</p>

            <div className="panel-grid panel-grid--double">
              <div className="detail-box detail-box--tertiary">
                <span className="detail-label">Finding will link to</span>
                <p>{evidenceContext.taskContext || "Current session context"}</p>
              </div>
              <div className="detail-box detail-box--tertiary">
                <span className="detail-label">Recent command</span>
                <p>
                  {evidenceContext.recentCommand ||
                    "Run a command in the workspace to seed this draft."}
                </p>
              </div>
            </div>

            {evidenceContext.evidence ? (
              <div className="finding-card__evidence">
                <span className="detail-label">Evidence snapshot</span>
                <pre className="terminal-evidence">{evidenceContext.evidence}</pre>
              </div>
            ) : null}

            <div className="inline-actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={applyEvidenceFindingDraft}
                disabled={!evidenceContext.hasEvidence}
              >
                Use Evidence Draft
              </button>
              <Link
                className="button button--ghost"
                to={buildSessionPath(sessionId, "workspace")}
              >
                Return to Workspace
              </Link>
            </div>
          </div>

          <form className="form-grid reports-form" onSubmit={saveFinding}>
            <input
              type="text"
              name="title"
              placeholder="Finding title"
              value={findingForm.title}
              onChange={updateFindingForm}
              className="field"
            />

            <select
              name="severity"
              value={findingForm.severity}
              onChange={updateFindingForm}
              className="field"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>

            <textarea
              name="description"
              placeholder="Describe the finding. Optional sections: Task Context:, Task Objective:, Recent Command:, Evidence:, Impact:, Recommendation:"
              value={findingForm.description}
              onChange={updateFindingForm}
              rows="6"
              className="field field--textarea"
            />

            <p className="section-note">
              Saved findings automatically keep the current task, recent
              command, and evidence snapshot when that context is available.
            </p>

            <button
              type="submit"
              className="button button--secondary"
              disabled={savingFinding}
            >
              {savingFinding ? "Saving..." : "Save Finding"}
            </button>
          </form>
        </div>
      </section>

      <section className="panel-grid panel-grid--double">
        <article className="surface-card reports-panel reports-panel--results">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Captured Evidence</span>
              <h2>Saved Findings</h2>
            </div>
            <span
              className={badgeClass(highSeverityCount ? "danger" : "info")}
            >
              {highSeverityCount
                ? `${highSeverityCount} high severity`
                : `${findings.length} saved`}
            </span>
          </div>

          <p className="section-lead">
            Findings collect the evidence worth carrying forward from the
            workspace into the final session report, including the task and
            command context that produced it.
          </p>

          {findings.length ? (
            <div className="stack-list reports-findings-list">
              {findings.map((finding, index) => {
                const findingContent = buildFindingContent(finding);
                const isEvidenceBacked = Boolean(
                  findingContent.evidence || findingContent.recentCommand
                );
                const isTaskLinked = Boolean(
                  findingContent.taskContext || findingContent.taskObjective
                );

                return (
                  <article
                    key={finding.id ?? `${finding.title}-${index}`}
                    className={`finding-card finding-card--result ${getFindingSeverityClass(
                      finding.severity
                    )}`}
                  >
                    <div className="finding-card__header">
                      <div>
                        <h3>{finding.title}</h3>
                        <span className="section-note">
                          Session #{finding.session_id}
                        </span>
                      </div>
                      <div className="tag-row">
                        <span
                          className={badgeClass(
                            severityMeta[finding.severity]?.tone || "warning"
                          )}
                        >
                          {finding.severity}
                        </span>
                        {isTaskLinked ? (
                          <span className={badgeClass("info")}>Task-linked</span>
                        ) : null}
                        {isEvidenceBacked ? (
                          <span className={badgeClass("sky")}>
                            Evidence-backed
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="finding-card__body">
                      {[
                        renderFindingBlock(
                          "Task Context",
                          findingContent.taskContext,
                          "finding-card__task-context"
                        ),
                        renderFindingBlock(
                          "Task Objective",
                          findingContent.taskObjective,
                          "finding-card__task-objective"
                        ),
                        renderFindingBlock(
                          "Recent Command",
                          findingContent.recentCommand,
                          "finding-card__recent-command"
                        ),
                        renderFindingBlock(
                          "Summary",
                          findingContent.summary || "No summary available.",
                          "finding-card__summary"
                        ),
                        renderFindingBlock(
                          "Evidence",
                          findingContent.evidence,
                          "finding-card__evidence"
                        ),
                        renderFindingBlock(
                          "Impact",
                          findingContent.impact,
                          "finding-card__impact"
                        ),
                        renderFindingBlock(
                          "Recommendation",
                          findingContent.recommendation,
                          "finding-card__recommendation"
                        ),
                      ]
                        .filter(Boolean)
                        .map((block) => (
                          <div key={block.label} className={block.className}>
                            <span className="detail-label">{block.label}</span>
                            {block.label === "Evidence" ||
                            block.label === "Recent Command" ? (
                              <pre className="terminal-evidence">
                                {block.value}
                              </pre>
                            ) : (
                              <p>{block.value}</p>
                            )}
                          </div>
                        ))}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-card">
              <div className="content-stack">
                <strong>No findings saved yet</strong>
                <p>
                  {workflow.hasCommandActivity
                    ? "Commands have already been captured for this session. Save the strongest evidence as a finding here or accept a tutor suggestion from the workspace."
                    : "Use the workspace to gather evidence, then save the strongest observations here or accept a tutor suggestion from the workspace."}
                </p>
                <div className="inline-actions">
                  <Link
                    className="button button--secondary"
                    to={buildSessionPath(sessionId, "workspace")}
                  >
                    Return to Workspace
                  </Link>
                  <Link
                    className="button button--ghost"
                    to={buildSessionPath(sessionId, "guide")}
                  >
                    Review Guide
                  </Link>
                </div>
              </div>
            </div>
          )}
        </article>

        <article className="surface-card reports-panel reports-panel--report">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Generated Summary</span>
              <h2>Session Report</h2>
            </div>
            <span
              className={badgeClass(
                riskMeta[report?.analysis?.risk_level]?.tone ||
                  (workflow.reportGenerated ? "info" : "muted")
              )}
            >
              {report?.analysis?.risk_level
                ? `Risk: ${report.analysis.risk_level}`
                : workflow.reportGenerated
                ? "Generated previously"
                : "Not generated yet"}
            </span>
          </div>

          <p className="section-lead">
            The report is the final synthesis of the saved findings, the linked
            task context, and the evidence captured during the session.
          </p>

          {report ? (
            <div className="content-stack">
              <div className="detail-box report-hero">
                <div className="tag-row">
                  <span
                    className={badgeClass(
                      riskMeta[report.analysis?.risk_level]?.tone || "muted"
                    )}
                  >
                    {report.analysis?.risk_level || "Unknown"} risk
                  </span>
                  <span className={badgeClass("info")}>
                    {findings.length} finding{findings.length === 1 ? "" : "s"}
                  </span>
                  <span className={badgeClass("sky")}>
                    {evidenceStats.evidenceAwareCount} evidence-backed
                  </span>
                </div>
                <span className="detail-label">Executive Summary</span>
                <p>{report.analysis?.summary || "No summary available."}</p>
              </div>

              <div className="panel-grid panel-grid--double report-analysis-grid">
                <div className="detail-box report-card">
                  <span className="detail-label">Key Issues</span>
                  {report.analysis?.key_issues?.length ? (
                    <ul className="detail-list">
                      {report.analysis.key_issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No key issues returned.</p>
                  )}
                </div>

                <div className="detail-box report-card report-card--accent">
                  <span className="detail-label">Recommendations</span>
                  {report.analysis?.recommendations?.length ? (
                    <ul className="detail-list">
                      {report.analysis.recommendations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No recommendations returned.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-card">
              <div className="content-stack">
                <strong>
                  {report
                    ? "Report ready"
                    : workflow.reportGenerated
                    ? "Report generated previously"
                    : findings.length
                    ? "Ready for a report draft"
                    : "No report data yet"}
                </strong>
                <p>
                  {workflow.reportGenerated
                    ? "A report has already been generated for this session. Generate it again if you want to refresh the current summary from the latest saved findings."
                    : findings.length
                    ? workflow.reportReadiness.detail
                    : workflow.hasCommandActivity
                    ? "Reports are close, but the session still needs at least one saved finding before the report feels complete."
                    : "Reports appear after the workspace produces evidence and you save it as findings."}
                </p>
                <div className="inline-actions">
                  {(findings.length || workflow.reportGenerated) ? (
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={handleGenerateReport}
                      disabled={generatingReport}
                    >
                      {generatingReport ? "Generating..." : "Generate Report"}
                    </button>
                  ) : null}
                  <Link
                    className="button button--ghost"
                    to={buildSessionPath(
                      sessionId,
                      summary.sortedFindings.length ? "workspace" : "guide"
                    )}
                  >
                    {summary.sortedFindings.length
                      ? "Return to Workspace"
                      : "Review Guide"}
                  </Link>
                </div>
              </div>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
