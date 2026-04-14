import { severityMeta } from "../utils/session";

function getDifficultyTone(difficulty) {
  if (difficulty === "Beginner") {
    return "success";
  }

  if (difficulty === "Advanced") {
    return "danger";
  }

  return severityMeta.Medium.tone;
}

export default function LabCard({
  lab,
  isSelected,
  isActiveSession,
  onSelect,
  onStart,
}) {
  const difficultyTone = getDifficultyTone(lab.difficulty);

  function handleSelect() {
    onSelect(lab.labId);
  }

  return (
    <article
      className={`lab-card${isSelected ? " lab-card--selected" : ""}`}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
    >
      <div className="lab-card__top">
        <div>
          <div className="lab-card__eyebrow">Guided Lab</div>
          <h3>{lab.name}</h3>
        </div>
        <span className={`badge badge--${difficultyTone}`}>
          {lab.difficulty || "Training"}
        </span>
      </div>

      <p className="lab-card__description">
        {lab.description || "Lab details are loading."}
      </p>

      <div className="lab-card__meta">
        <span>{lab.category || "Security"}</span>
        <span>
          {lab.estimated_duration_minutes
            ? `${lab.estimated_duration_minutes} min`
            : "Self-paced"}
        </span>
        <span>{lab.tasks?.length || 0} tasks</span>
      </div>

      <div className="lab-card__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={(event) => {
            event.stopPropagation();
            onStart(lab.labId);
          }}
        >
          {isActiveSession ? "Resume Session" : "Start Session"}
        </button>

        <button
          type="button"
          className="button button--ghost"
          onClick={(event) => {
            event.stopPropagation();
            handleSelect();
          }}
        >
          {isSelected ? "Lab Selected" : "Select Lab"}
        </button>
      </div>
    </article>
  );
}
