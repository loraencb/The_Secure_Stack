import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  clearAuthToken,
  getAuthToken,
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  setAuthToken,
} from "../api/Client";
import { clearStoredSessionState } from "../utils/session";
import { clearStoredWorkflowState } from "../utils/workflow";

const AuthContext = createContext(null);

function clearLocalAppState() {
  clearAuthToken();
  clearStoredSessionState();
  clearStoredWorkflowState();
}

export function AuthProvider({ children }) {
  const [authToken, setAuthTokenState] = useState(() => getAuthToken());
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAuth() {
      if (!authToken) {
        if (!cancelled) {
          setUser(null);
          setAuthReady(true);
        }
        return;
      }

      try {
        const currentUser = await getCurrentUser();
        if (!cancelled) {
          setUser(currentUser);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Auth hydration error:", error);
          clearLocalAppState();
          setAuthTokenState("");
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    }

    setAuthReady(false);
    hydrateAuth();

    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    function handleUnauthorized() {
      clearLocalAppState();
      setAuthTokenState("");
      setUser(null);
    }

    window.addEventListener("securestack:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("securestack:unauthorized", handleUnauthorized);
    };
  }, []);

  async function authenticate(mode, payload) {
    setAuthLoading(true);

    try {
      const response =
        mode === "register"
          ? await registerUser(payload)
          : await loginUser(payload);

      clearStoredSessionState();
      clearStoredWorkflowState();
      setAuthToken(response.access_token);
      setAuthTokenState(response.access_token);
      setUser(response.user);
      return response.user;
    } finally {
      setAuthLoading(false);
    }
  }

  async function signIn(payload) {
    return authenticate("login", payload);
  }

  async function signUp(payload) {
    return authenticate("register", payload);
  }

  async function signOut() {
    try {
      if (authToken) {
        await logoutUser();
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearLocalAppState();
      setAuthTokenState("");
      setUser(null);
    }
  }

  const value = useMemo(
    () => ({
      authToken,
      user,
      authReady,
      authLoading,
      isAuthenticated: Boolean(authToken && user),
      signIn,
      signUp,
      signOut,
    }),
    [authLoading, authReady, authToken, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
