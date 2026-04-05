import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  getIdTokenResult,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);
const USERNAME_REGEX = /^[A-Za-z0-9]+$/;

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [claimsRole, setClaimsRole] = useState("guest");
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid) => {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setLoading(true);

      if (!user) {
        setFirebaseUser(null);
        setProfile(null);
        setClaimsRole("guest");
        setLoading(false);
        return;
      }

      const tokenResult = await getIdTokenResult(user, true);
      const roleFromClaim = tokenResult.claims?.role || "user";
      const userProfile = await loadProfile(user.uid);

      setFirebaseUser(user);
      setClaimsRole(roleFromClaim);
      setProfile(userProfile);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const register = async (email, password) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      email: cred.user.email,
      username: "",
      usernameLower: "",
      role: "user",
      favorites: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return cred.user;
  };

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  };

  const logout = async () => {
    await signOut(auth);
  };

  const setUsernameOnce = async (username) => {
    if (!firebaseUser) throw new Error("Chưa đăng nhập");
    if (!USERNAME_REGEX.test(username)) {
      throw new Error("Username chỉ gồm chữ cái và số");
    }

    const usernameLower = username.toLowerCase();
    const q = query(
      collection(db, "users"),
      where("usernameLower", "==", usernameLower)
    );
    const existing = await getDocs(q);
    const taken = existing.docs.some((d) => d.id !== firebaseUser.uid);

    if (taken) throw new Error("Username đã tồn tại");

    await updateDoc(doc(db, "users", firebaseUser.uid), {
      username,
      usernameLower,
      updatedAt: serverTimestamp(),
    });

    const fresh = await loadProfile(firebaseUser.uid);
    setProfile(fresh);
  };

  const refreshAuthState = async () => {
    if (!auth.currentUser) return;
    const tokenResult = await getIdTokenResult(auth.currentUser, true);
    setClaimsRole(tokenResult.claims?.role || "user");
    const userProfile = await loadProfile(auth.currentUser.uid);
    setProfile(userProfile);
  };

  const value = useMemo(() => {
    const firestoreRole = profile?.role || "guest";
    const role = claimsRole !== "guest" ? claimsRole : firestoreRole;

    return {
      firebaseUser,
      profile,
      role,
      loading,
      isLoggedIn: !!firebaseUser,
      isAdmin: role === "admin",
      isModerator: role === "moderator",
      canEditMap: role === "admin" || role === "moderator",
      needsUsername: !!firebaseUser && !!profile && !profile.username,
      register,
      login,
      logout,
      setUsernameOnce,
      refreshAuthState,
    };
  }, [firebaseUser, profile, claimsRole, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthCtx() {
  return useContext(AuthContext);
}