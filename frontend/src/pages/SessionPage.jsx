import { useEffect } from "react";
import { useParams } from "react-router-dom";
import SessionWorkspace from "../components/session/SessionWorkspace";
import { useSecureStack } from "../context/SecureStackContext";

export default function SessionPage() {
  const { id } = useParams();
  const { activeLabId, sessionId, setSessionFromRoute } = useSecureStack();
  const routeSessionId = Number(id);
  const invalidSessionId = !Number.isInteger(routeSessionId) || routeSessionId <= 0;

  useEffect(() => {
    if (
      !invalidSessionId &&
      routeSessionId !== sessionId
    ) {
      setSessionFromRoute(routeSessionId, activeLabId);
    }
  }, [
    activeLabId,
    invalidSessionId,
    routeSessionId,
    sessionId,
    setSessionFromRoute,
  ]);

  return (
    <SessionWorkspace
      routeSessionId={invalidSessionId ? null : routeSessionId}
      invalidSessionId={invalidSessionId}
    />
  );
}
