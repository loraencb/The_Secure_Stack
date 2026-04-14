import { Link } from "react-router-dom";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";
import { riskMeta, severityMeta } from "../../utils/session";
import { badgeClass } from "./sessionUi";

const FINDING_SECTION_PATTERN = /(?:^|\n)(Evidence|Impact|Recommendation):\s*/g;
const FINDING_KEYS = {
  Evidence: "evidence",
  Impact: "impact",
  Recommendation: "recommendation",
};

function splitFindingContent(description = "") {
  const content = description.trim();
  const matches = [];
  let match;
  FINDING_SECTION_PATTERN.lastIndex = 0;

  while ((match = FINDING_SECTION_PATTERN.exec(content)) !== null) {
    matches.push({
      key: FINDING_KEYS[match[1]],
      markerIndex: match.index + (match[0].startsWith("\n") ? 1 : 0),
      contentStart: FINDING_SECTION_PATTERN.lastIndex,
    });
  }

  if (!matches.length) {
    return {
      summary: content,
      evidence: "",
      impact: "",
      recommendation: "",
    };
  }

  const findingContent = {
    summary: content.slice(0, matches[0].markerIndex).trim(),
    evidence: "",
    impact: "",
    recommendation: "",
  };

  matches.forEach((section, index) => {
    const nextSection = matches[index + 1];
    findingContent[section.key] = content
      .slice(section.contentStart, nextSection?.markerIndex ?? content.length)
      .trim();
  });

  return findingContent;
}

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
    updateFindingForm,
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
  const aiAssistedCount = findings.filter((finding) => {
    const findingContent = splitFindingContent(finding.description || "");
    return Boolean(findingContent.evidence);
  }).length;

  return (
    <div className="page-stack">
      <section className="surface-card reports-panel reports-panel--composer">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Session Results</span>
            <h2>Findings And Report</h2>
          </div>
          <span className={badgeClass(report ? "success" : "info")}>
            {report
              ? "Report ready"
              : findings.length
              ? "Evidence ready for summary"
              : "Waiting for findings"}
          </span>
        </div>

        <p className="section-lead">
          Turn validated workspace output into saved findings here, then
          generate a concise report when the session has enough evidence.
        </p>

        <div className="reports-summary-grid">
          <div className="stat-card">
            <span>Saved findings</span>
            <strong>{findings.length}</strong>
          </div>
          <div className="stat-card">
            <span>High severity</span>
            <strong>{highSeverityCount}</strong>
          </div>
          <div className="stat-card">
            <span>AI-assisted</span>
            <strong>{aiAssistedCount}</strong>
          </div>
          <div className="stat-card">
            <span>Report</span>
            <strong>{report ? "Ready" : "Not generated"}</strong>
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
            <span className={badgeClass("sky")}>
              {savingFinding ? "Saving entry..." : "Manual entry"}
            </span>
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
              placeholder="Describe the finding. Optional sections: Evidence:, Impact:, Recommendation:"
              value={findingForm.description}
              onChange={updateFindingForm}
              rows="6"
              className="field field--textarea"
            />

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
            workspace into the final session report.
          </p>

          {findings.length ? (
            <div className="stack-list reports-findings-list">
              {findings.map((finding, index) => {
                const findingContent = splitFindingContent(
                  finding.description || ""
                );
                const aiAssisted = Boolean(findingContent.evidence);

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
                        {aiAssisted ? (
                          <span className={badgeClass("sky")}>AI-assisted</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="finding-card__body">
                      {[
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
                            {block.label === "Evidence" ? (
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
                  Use the workspace to gather evidence, then save the strongest
                  observations here or accept an AI suggestion from the session
                  rail.
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
                  (report ? "info" : "muted")
              )}
            >
              {report?.analysis?.risk_level
                ? `Risk: ${report.analysis.risk_level}`
                : "Not generated yet"}
            </span>
          </div>

          <p className="section-lead">
            The report turns the saved findings into a concise summary with key
            issues and recommendations you can review before wrapping up the
            lab.
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
                  {findings.length
                    ? "Ready for a report draft"
                    : "No report data yet"}
                </strong>
                <p>
                  {findings.length
                    ? `You already have ${findings.length} finding${findings.length === 1 ? "" : "s"} saved. Generate the report to turn them into a session summary.`
                    : "Reports appear after the workspace produces evidence and you save it as findings."}
                </p>
                <div className="inline-actions">
                  {findings.length ? (
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
