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
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);
const USERNAME_REGEX = /^[A-Za-z0-9]+$/;

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setLoading(true);

      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (!user) {
        setFirebaseUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setFirebaseUser(user);

      const userRef = doc(db, "users", user.uid);

      unsubProfile = onSnapshot(
        userRef,
        async (snap) => {
          if (!snap.exists()) {
            await setDoc(
              userRef,
              {
                uid: user.uid,
                email: user.email || "",
                username: "",
                usernameLower: "",
                role: "user",
                favorites: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
            return;
          }

          setProfile(snap.data());
          setLoading(false);
        },
        (error) => {
          console.error("User profile snapshot error:", error);
          setProfile(null);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubProfile) unsubProfile();
      unsubAuth();
    };
  }, []);

  const register = async (email, password) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      email: cred.user.email || "",
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

    if (taken) {
      throw new Error("Username đã tồn tại");
    }

    await updateDoc(doc(db, "users", firebaseUser.uid), {
      username,
      usernameLower,
      updatedAt: serverTimestamp(),
    });
  };

  const value = useMemo(() => {
    const role = profile?.role || "guest";

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
    };
  }, [firebaseUser, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthCtx() {
  return useContext(AuthContext);
}