import { useLocation } from "react-router-dom";
import { SESSION_SECTIONS } from "../../config/sessionSections";

function getSectionCopy(pathname) {
  return (
    SESSION_SECTIONS.find((section) => pathname.endsWith(`/${section.slug}`)) ||
    SESSION_SECTIONS[0]
  );
}

export default function SessionSectionFallback() {
  const location = useLocation();
  const section = getSectionCopy(location.pathname);

  return (
    <section className="surface-card session-section-fallback">
      <div className="content-stack">
        <div>
          <span className="eyebrow">Loading Mini Lab Guide</span>
          <h2>{section.label}</h2>
        </div>
        <p>
          Preparing this guide section while the rest of the session workspace
          stays anchored in place.
        </p>
        <div className="session-guide-note">
          <span>{section.phase}</span>
          <p>{section.description}</p>
        </div>

        <div className="session-section-fallback__skeletons">
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--body" />
          <div className="skeleton skeleton--body" />
          <div className="skeleton skeleton--button" />
        </div>
      </div>
    </section>
  );
}
