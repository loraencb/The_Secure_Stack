import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from alembic import command


ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(tempfile.gettempdir()) / "SecureStack" / "securestack_instructor_review.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
if DB_PATH.exists():
    DB_PATH.unlink()
journal_path = DB_PATH.with_name(f"{DB_PATH.name}-journal")
if journal_path.exists():
    journal_path.unlink()
os.environ["SECURESTACK_DATABASE_PATH"] = str(DB_PATH)
sys.path.insert(0, str(ROOT / "backend"))

from app import models, schemas  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import SessionLocal, engine, get_alembic_config  # noqa: E402
from app.routers.auth import register_user  # noqa: E402
from app.routers.instructor_review import (  # noqa: E402
    get_review_session_detail,
    list_review_sessions,
)
from app.routers.sessions import start_session  # noqa: E402
from app.security import hash_password  # noqa: E402


command.upgrade(get_alembic_config(), "head")


class InstructorReviewTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        engine.dispose()

    def setUp(self):
        self.db = SessionLocal()
        self._original_instructor_emails = set(settings.instructor_emails)
        settings.instructor_emails = {"ta@example.com"}

        self.db.query(models.AuthToken).delete()
        self.db.query(models.TutorEvent).delete()
        self.db.query(models.Finding).delete()
        self.db.query(models.TaskCompletion).delete()
        self.db.query(models.Session).delete()
        self.db.query(models.User).delete()
        self.db.commit()

    def tearDown(self):
        settings.instructor_emails = self._original_instructor_emails
        self.db.close()

    def test_instructor_can_review_student_session(self):
        learner_response = register_user(
            schemas.UserCreate(
                email="student@example.com",
                password="password123",
                display_name="Student One",
            ),
            self.db,
        )
        learner = self.db.query(models.User).filter_by(email="student@example.com").first()
        self.assertIsNotNone(learner)

        instructor = models.User(
            email="ta@example.com",
            display_name="Teaching Assistant",
            password_hash=hash_password("password123"),
        )
        self.db.add(instructor)
        self.db.commit()
        self.db.refresh(instructor)

        session = start_session(
            schemas.SessionCreate(
                lab_name="OWASP Juice Shop Recon Lab",
                lab_id="juice-shop-recon",
            ),
            self.db,
            learner,
        )
        session.environment_launched_at = datetime.now(timezone.utc)
        self.db.add(
            models.TaskCompletion(
                session_id=session.id,
                lab_id="juice-shop-recon",
                task_id="verify-connectivity",
                status="completed",
                completion_method="command_match",
                evidence_command="ping -c 1 target",
                ai_status="successful",
                ai_feedback="Connectivity verified.",
                evidence_quality="strong",
                completed_at=datetime.now(timezone.utc),
            )
        )
        self.db.add(
            models.TaskCompletion(
                session_id=session.id,
                lab_id="juice-shop-recon",
                task_id="identify-open-services",
                status="attempted",
                completion_method="command_match",
                evidence_command="nmap target",
                ai_status="insufficient",
                ai_feedback="The scan ran, but the evidence is still incomplete.",
                evidence_quality="partial",
                completed_at=datetime.now(timezone.utc),
            )
        )
        self.db.add(
            models.TutorEvent(
                session_id=session.id,
                user_id=learner.id,
                lab_id="juice-shop-recon",
                task_id="identify-open-services",
                step_number=2,
                step_title="Identify Open Services",
                response_origin="proactive_tutor",
                tutor_mode="strong_hint",
                intervention_reason="stuck_intervention",
                ask_intent=None,
                learner_message=None,
                tutor_message="You have enough to move into a version-aware scan now.",
            )
        )
        self.db.add(
            models.TutorEvent(
                session_id=session.id,
                user_id=learner.id,
                lab_id="juice-shop-recon",
                task_id="identify-open-services",
                step_number=2,
                step_title="Identify Open Services",
                response_origin="ask_tutor",
                tutor_mode="strong_hint",
                intervention_reason=None,
                ask_intent="stuck",
                learner_message="I'm stuck",
                tutor_message="Use version detection so the service output is more useful.",
            )
        )
        self.db.add(
            models.Finding(
                session_id=session.id,
                user_id=learner.id,
                title="Juice Shop reachable",
                severity="Medium",
                description="The HTTP response confirms the target application is reachable.",
                source="manual",
                task_id="inspect-web-application",
                task_label="Step 3: Inspect the web application",
                evidence_command="curl -i http://target:3000",
                evidence_snapshot="HTTP/1.1 200 OK",
            )
        )
        self.db.commit()

        summaries = list_review_sessions(self.db, instructor)
        self.assertEqual(len(summaries), 1)
        self.assertEqual(summaries[0].student_email, "student@example.com")
        self.assertEqual(summaries[0].completed_steps, 1)
        self.assertEqual(summaries[0].findings_count, 1)
        self.assertEqual(summaries[0].tutor_interventions, 2)
        self.assertEqual(summaries[0].explicit_help_requests, 1)
        self.assertEqual(summaries[0].support_level, "Light support")

        detail = get_review_session_detail(session.id, self.db, instructor)
        self.assertEqual(detail.session.student_display_name, "Student One")
        self.assertEqual(len(detail.step_summaries), 4)
        struggling_step = next(
            step for step in detail.step_summaries if step.task_id == "identify-open-services"
        )
        self.assertEqual(struggling_step.status, "attempted")
        self.assertEqual(struggling_step.tutor_interventions, 2)
        self.assertEqual(struggling_step.explicit_help_requests, 1)
        self.assertIn("version-aware scan", detail.tutor_events[0].tutor_message)
        self.assertEqual(detail.findings[0].title, "Juice Shop reachable")


if __name__ == "__main__":
    unittest.main()
