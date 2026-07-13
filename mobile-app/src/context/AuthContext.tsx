import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  listenToAuthState,
  loginWithUsername,
  logoutUser,
} from "../services/authService";
import {
  getUserProfile,
  type GreenMirrorUserProfile,
} from "../services/userService";

interface AuthContextValue {
  firebaseUser: User | null;
  profile: GreenMirrorUserProfile | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadProfile: () => Promise<void>;
}

function missingProviderError(): never {
  throw new Error("useAuth must be used inside an AuthProvider.");
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  profile: null,
  loading: true,
  error: null,
  isAdmin: false,
  login: async () => missingProviderError(),
  logout: async () => missingProviderError(),
  reloadProfile: async () => missingProviderError(),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<GreenMirrorUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfileForUser = useCallback(async (user: User | null) => {
    setError(null);

    if (!user) {
      setProfile(null);
      return;
    }

    const loadedProfile = await getUserProfile(user.uid);

    if (!loadedProfile) {
      setProfile(null);
      throw new Error(
        "No GreenMirror profile found for this account. Ask an admin to create your profile.",
      );
    }

    if (!loadedProfile.active) {
      setProfile(null);
      throw new Error(
        "This account has been deactivated. Ask an admin for help.",
      );
    }

    setProfile(loadedProfile);
  }, []);

  useEffect(() => {
    const unsub = listenToAuthState(async (user) => {
      setLoading(true);
      setFirebaseUser(user);

      try {
        await loadProfileForUser(user);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not load user profile.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [loadProfileForUser]);

  const login = useCallback(
    async (username: string, password: string) => {
      setLoading(true);
      setError(null);

      try {
        const user = await loginWithUsername(username, password);
        setFirebaseUser(user);
        await loadProfileForUser(user);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Login failed.";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [loadProfileForUser],
  );

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await logoutUser();
      setFirebaseUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadProfile = useCallback(async () => {
    await loadProfileForUser(firebaseUser);
  }, [firebaseUser, loadProfileForUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      profile,
      loading,
      error,
      isAdmin: profile?.role === "admin",
      login,
      logout,
      reloadProfile,
    }),
    [firebaseUser, profile, loading, error, login, logout, reloadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
