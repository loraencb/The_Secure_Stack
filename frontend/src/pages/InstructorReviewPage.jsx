import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getInstructorReviewSession,
  getInstructorReviewSessions,
} from "../api/Client";

function formatReviewDate(value) {
  if (!value) {
    return "Unavailable";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function getSupportTone(level) {
  switch (level) {
    case "Independent":
      return "success";
    case "Light support":
      return "info";
    default:
      return "warning";
  }
}

function getStepTone(status) {
  switch (status) {
    case "completed":
      return "success";
    case "off_track":
      return "danger";
    case "attempted":
      return "warning";
    default:
      return "muted";
  }
}

function getTutorEventLabel(event) {
  if (event.response_origin === "proactive_tutor") {
    const supportLabels = {
      idle_nudge: "quiet check-in",
      off_track_redirect: "course correction",
      browser_handoff_guidance: "browser handoff",
      success_reinforcement: "success note",
      progress_briefing: "progress note",
      stuck_intervention: "support check-in",
    };

    return supportLabels[event.intervention_reason] || "tutor check-in";
  }

  const askLabels = {
    hint: "student asked for a hint",
    explain: "student asked for explanation",
    stuck: "student said they were stuck",
    what_next: "student asked what to do next",
    idle_nudge: "quiet check-in",
  };

  return askLabels[event.ask_intent] || "student ask";
}

export default function InstructorReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const selectedSessionId = Number(searchParams.get("session") || 0);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setSessionsLoading(true);
      setSessionsError("");

      try {
        const response = await getInstructorReviewSessions();
        if (!cancelled) {
          const nextSessions = Array.isArray(response) ? response : [];
          setSessions(nextSessions);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Instructor review load error:", error);
          setSessionsError(
            error.message || "Failed to load instructor review sessions."
          );
        }
      } finally {
        if (!cancelled) {
          setSessionsLoading(false);
        }
      }
    }

    loadSessions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessions.length) {
      return;
    }

    const selectedExists = sessions.some((entry) => entry.id === selectedSessionId);
    if (!selectedSessionId || !selectedExists) {
      setSearchParams({ session: String(sessions[0].id) }, { replace: true });
    }
  }, [selectedSessionId, sessions, setSearchParams]);

  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null);
      setDetailError("");
      return;
    }

    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);
      setDetailError("");

      try {
        const response = await getInstructorReviewSession(selectedSessionId);
        if (!cancelled) {
          setDetail(response);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Instructor review detail error:", error);
          setDetail(null);
          setDetailError(
            error.message || "Failed to load the selected session review."
          );
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  const summaryStats = useMemo(() => {
    const total = sessions.length;
    const completed = sessions.filter(
      (entry) => entry.history_status === "Report generated" || entry.status === "completed"
    ).length;
    const supportHeavy = sessions.filter(
      (entry) => entry.support_level === "Support-heavy"
    ).length;
    const reports = sessions.filter((entry) => entry.report_generated_at).length;

    return {
      total,
      completed,
      supportHeavy,
      reports,
    };
  }, [sessions]);

  return (
    <div className="page-stack">
      <section className="page-header page-header--single">
        <div>
          <span className="eyebrow">Instructor Review</span>
          <h1>Review how students moved through each lab, where support was needed, and what evidence they produced.</h1>
          <p>
            This view shows lab progress, tutor support, findings, and report
            status so professors and TAs can understand a student run quickly.
          </p>
        </div>
      </section>

      <section className="panel-grid panel-grid--quad">
        <article className="surface-card stat-card stat-card--large">
          <span>Reviewed sessions</span>
          <strong>{summaryStats.total}</strong>
        </article>
        <article className="surface-card stat-card stat-card--large">
          <span>Completed or reported</span>
          <strong>{summaryStats.completed}</strong>
        </article>
        <article className="surface-card stat-card stat-card--large">
          <span>Support-heavy runs</span>
          <strong>{summaryStats.supportHeavy}</strong>
        </article>
        <article className="surface-card stat-card stat-card--large">
          <span>Reports generated</span>
          <strong>{summaryStats.reports}</strong>
        </article>
      </section>

      <div className="workspace-grid instructor-review-grid">
        <div className="workspace-grid__main">
          {detailLoading ? (
            <section className="surface-card empty-card">
              <strong>Loading session review</strong>
              <p>The instructor review detail is being prepared.</p>
            </section>
          ) : detailError ? (
            <section className="surface-card empty-card">
              <strong>Review unavailable</strong>
              <p>{detailError}</p>
            </section>
          ) : detail ? (
            <>
              <section className="surface-card">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Session Snapshot</span>
                    <h2>{detail.session.lab_name}</h2>
                  </div>
                  <span className={`badge badge--${getSupportTone(detail.session.support_level)}`}>
                    {detail.session.support_level}
                  </span>
                </div>

                <div className="detail-grid detail-grid--three">
                  <div className="detail-box">
                    <span className="detail-label">Student</span>
                    <p>
                      <strong>{detail.session.student_display_name}</strong>
                      <br />
                      {detail.session.student_email}
                    </p>
                  </div>
                  <div className="detail-box">
                    <span className="detail-label">Session state</span>
                    <p>{detail.session.history_status}</p>
                  </div>
                  <div className="detail-box">
                    <span className="detail-label">Started</span>
                    <p>{formatReviewDate(detail.session.start_time)}</p>
                  </div>
                  <div className="detail-box">
                    <span className="detail-label">Step progress</span>
                    <p>
                      {detail.session.completed_steps}/{detail.session.total_steps} completed
                    </p>
                  </div>
                  <div className="detail-box">
                    <span className="detail-label">Tutor support</span>
                    <p>
                      {detail.session.tutor_interventions} total,{" "}
                      {detail.session.explicit_help_requests} student-initiated
                    </p>
                  </div>
                  <div className="detail-box">
                    <span className="detail-label">Outputs</span>
                    <p>
                      {detail.session.findings_count} finding
                      {detail.session.findings_count === 1 ? "" : "s"}
                      {detail.session.report_generated_at
                        ? `, report generated ${formatReviewDate(
                            detail.session.report_generated_at
                          )}`
                        : ", no report yet"}
                    </p>
                  </div>
                </div>

                <div className="detail-grid detail-grid--three">
                  <div className="detail-box detail-box--tertiary">
                    <span className="detail-label">Tutor check-ins</span>
                    <p>{detail.session.proactive_interventions}</p>
                  </div>
                  <div className="detail-box detail-box--tertiary">
                    <span className="detail-label">Quiet check-ins</span>
                    <p>{detail.session.idle_nudges}</p>
                  </div>
                  <div className="detail-box detail-box--tertiary">
                    <span className="detail-label">Course corrections</span>
                    <p>{detail.session.off_track_events}</p>
                  </div>
                </div>
              </section>

              <section className="surface-card">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Step Review</span>
                    <h2>Where the student moved smoothly and where support was needed</h2>
                  </div>
                </div>

                {detail.step_summaries.length ? (
                  <div className="stack-list">
                    {detail.step_summaries.map((step) => (
                      <article key={step.task_id} className="stack-list__item">
                        <div className="section-heading">
                          <div>
                            <h3>
                              Step {step.step_number}: {step.title}
                            </h3>
                            <p>{step.objective || "No step objective recorded."}</p>
                          </div>
                          <span className={`badge badge--${getStepTone(step.status)}`}>
                            {step.status.replace("_", " ")}
                          </span>
                        </div>

                        <div className="detail-grid detail-grid--three">
                          <div className="detail-box detail-box--tertiary">
                            <span className="detail-label">Support level</span>
                            <p>{step.support_level}</p>
                          </div>
                          <div className="detail-box detail-box--tertiary">
                            <span className="detail-label">Tutor support</span>
                            <p>{step.tutor_interventions}</p>
                          </div>
                          <div className="detail-box detail-box--tertiary">
                            <span className="detail-label">Check-ins / corrections</span>
                            <p>
                              {step.idle_nudges} quiet, {step.off_track_events} corrective
                            </p>
                          </div>
                        </div>

                        {step.evidence_command ? (
                          <div className="detail-box detail-box--tertiary">
                            <span className="detail-label">Evidence command</span>
                            <p>{step.evidence_command}</p>
                          </div>
                        ) : null}

                        {step.ai_feedback ? (
                          <div className="detail-box detail-box--tertiary">
                            <span className="detail-label">Completion feedback</span>
                            <p>{step.ai_feedback}</p>
                          </div>
                        ) : null}

                        {step.latest_tutor_message ? (
                          <div className="detail-box detail-box--tertiary">
                            <span className="detail-label">Latest tutor message</span>
                            <p>{step.latest_tutor_message}</p>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-card">
                    <strong>No step review data yet</strong>
                    <p>
                      The student has not moved through persisted lab steps for
                      this session yet.
                    </p>
                  </div>
                )}
              </section>

              <section className="surface-card">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Tutor Support Trail</span>
                    <h2>How the tutor supported the student during the run</h2>
                  </div>
                </div>

                {detail.tutor_events.length ? (
                  <div className="stack-list">
                    {detail.tutor_events.slice().reverse().map((event) => (
                      <article key={event.id} className="stack-list__item">
                        <div className="section-heading">
                          <div>
                            <h3>
                              {event.step_title || "General session support"}
                            </h3>
                            <p>{formatReviewDate(event.created_at)}</p>
                          </div>
                          <span className={`badge badge--${getSupportTone(
                            event.response_origin === "proactive_tutor"
                              ? "Light support"
                              : "Support-heavy"
                          )}`}>
                            {getTutorEventLabel(event)}
                          </span>
                        </div>
                        {event.learner_message ? (
                          <div className="detail-box detail-box--tertiary">
                            <span className="detail-label">Learner cue</span>
                            <p>{event.learner_message}</p>
                          </div>
                        ) : null}
                        <div className="detail-box detail-box--tertiary">
                          <span className="detail-label">Tutor response</span>
                          <p>{event.tutor_message}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-card">
                    <strong>No tutor support recorded yet</strong>
                    <p>
                      Tutor review entries appear here once the student asks for
                      help or the tutor checks in during the session.
                    </p>
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="surface-card empty-card">
              <strong>Select a student session</strong>
              <p>Choose a session from the review list to inspect its lab run.</p>
            </section>
          )}
        </div>

        <div className="workspace-grid__side">
          <section className="surface-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Review Queue</span>
                <h2>Recent student sessions</h2>
              </div>
            </div>

            {sessionsLoading ? (
              <div className="empty-card">
                <strong>Loading review queue</strong>
                <p>Preparing recent student sessions for instructor review.</p>
              </div>
            ) : sessionsError ? (
              <div className="empty-card">
                <strong>Review queue unavailable</strong>
                <p>{sessionsError}</p>
              </div>
            ) : sessions.length ? (
              <div className="stack-list instructor-session-list">
                {sessions.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`stack-list__item instructor-session-list__item${
                      entry.id === selectedSessionId ? " instructor-session-list__item--active" : ""
                    }`}
                    onClick={() =>
                      setSearchParams({ session: String(entry.id) }, { replace: true })
                    }
                  >
                    <div className="section-heading">
                      <div>
                        <h3>{entry.student_display_name}</h3>
                        <p>
                          {entry.lab_name} - Session #{entry.id}
                        </p>
                      </div>
                      <span className={`badge badge--${getSupportTone(entry.support_level)}`}>
                        {entry.support_level}
                      </span>
                    </div>
                    <div className="detail-grid detail-grid--two">
                      <div className="detail-box detail-box--tertiary">
                        <span className="detail-label">Progress</span>
                        <p>
                          {entry.completed_steps}/{entry.total_steps} steps
                        </p>
                      </div>
                      <div className="detail-box detail-box--tertiary">
                        <span className="detail-label">Tutor support</span>
                        <p>{entry.tutor_interventions} moments</p>
                      </div>
                      <div className="detail-box detail-box--tertiary">
                        <span className="detail-label">Outputs</span>
                        <p>
                          {entry.findings_count} findings
                          {entry.report_generated_at ? ", report ready" : ""}
                        </p>
                      </div>
                      <div className="detail-box detail-box--tertiary">
                        <span className="detail-label">Started</span>
                        <p>{formatReviewDate(entry.start_time)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-card">
                <strong>No student sessions yet</strong>
                <p>
                  Instructor review sessions will appear here once students
                  start running labs.
                </p>
              </div>
            )}
          </section>

          {detail ? (
            <section className="surface-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Outputs</span>
                  <h2>Findings and report trail</h2>
                </div>
              </div>

              {detail.findings.length ? (
                <div className="stack-list">
                  {detail.findings.map((finding) => (
                    <article key={finding.id} className="stack-list__item">
                      <div className="section-heading">
                        <div>
                          <h3>{finding.title}</h3>
                          <p>{finding.task_label || "General lab evidence"}</p>
                        </div>
                        <span className="badge badge--info">{finding.severity}</span>
                      </div>
                      <div className="detail-box detail-box--tertiary">
                        <span className="detail-label">Evidence</span>
                        <p>{finding.evidence_command || finding.evidence_snapshot || "No evidence snapshot recorded."}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-card">
                  <strong>No findings saved</strong>
                  <p>This run has not produced saved findings yet.</p>
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
