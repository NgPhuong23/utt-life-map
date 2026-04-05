import { useState } from "react";
import { useAuthCtx } from "../context/AuthContext";

const ADMIN_EMAIL = "uttmapvifu@vifu.com";

export default function AuthModal({ open, onClose }) {
  const { login, register } = useAuthCtx();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    try {
      setError("");
      setSubmitting(true);

      if (!email.trim() || !password.trim()) {
        throw new Error("Vui lòng nhập email và mật khẩu");
      }

      if (mode === "register") {
        if (email.toLowerCase() === ADMIN_EMAIL) {
          throw new Error("Email này dành riêng cho admin");
        }
        if (password !== confirmPassword) {
          throw new Error("Mật khẩu xác nhận không khớp");
        }
        await register(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }

      onClose();
    } catch (err) {
      setError(err.message || "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <button style={closeBtnStyle} onClick={onClose}>×</button>

        <h2 style={{ marginTop: 0 }}>
          {mode === "login" ? "Đăng nhập UTT Life Map" : "Đăng ký UTT Life Map"}
        </h2>

        <div style={fieldStyle}>
          <label>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label>Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nhập mật khẩu"
            style={inputStyle}
          />
        </div>

        {mode === "register" && (
          <div style={fieldStyle}>
            <label>Xác nhận mật khẩu</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu"
              style={inputStyle}
            />
          </div>
        )}

        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
          Username sẽ được đặt sau khi đăng nhập lần đầu.
        </div>

        {error && (
          <div style={{ color: "#dc2626", marginBottom: 12 }}>{error}</div>
        )}

        <button onClick={handleSubmit} style={primaryBtnStyle} disabled={submitting}>
          {submitting
            ? "Đang xử lý..."
            : mode === "login"
            ? "Đăng nhập"
            : "Đăng ký"}
        </button>

        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          style={secondaryBtnStyle}
        >
          {mode === "login"
            ? "Chưa có tài khoản? Đăng ký"
            : "Đã có tài khoản? Đăng nhập"}
        </button>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};

const modalStyle = {
  width: "100%",
  maxWidth: 420,
  background: "#fff",
  borderRadius: 20,
  padding: 24,
  position: "relative",
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
};

const closeBtnStyle = {
  position: "absolute",
  top: 10,
  right: 14,
  border: "none",
  background: "none",
  fontSize: 24,
  cursor: "pointer",
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginBottom: 12,
};

const inputStyle = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
};

const primaryBtnStyle = {
  width: "100%",
  padding: 14,
  borderRadius: 12,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  marginBottom: 10,
};

const secondaryBtnStyle = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
};