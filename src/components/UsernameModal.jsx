import { useState } from "react";
import { useAuthCtx } from "../context/AuthContext";

export default function UsernameModal() {
  const { needsUsername, setUsernameOnce } = useAuthCtx();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!needsUsername) return null;

  const handleSave = async () => {
    try {
      setError("");
      setSaving(true);
      await setUsernameOnce(username.trim());
    } catch (err) {
      setError(err.message || "Không thể đặt username");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ marginTop: 0 }}>Đặt username</h2>
        <p style={{ color: "#64748b", lineHeight: 1.6 }}>
          Username chỉ gồm chữ cái và số, không dấu cách, không ký tự đặc biệt.
        </p>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="VD: UTTMap123"
          style={inputStyle}
        />

        {error && <div style={{ color: "#dc2626", marginTop: 10 }}>{error}</div>}

        <button onClick={handleSave} style={primaryBtnStyle} disabled={saving}>
          {saving ? "Đang lưu..." : "Lưu username"}
        </button>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10000,
};

const modalStyle = {
  width: "100%",
  maxWidth: 420,
  background: "#fff",
  borderRadius: 20,
  padding: 24,
};

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  marginTop: 8,
};

const primaryBtnStyle = {
  width: "100%",
  padding: 14,
  borderRadius: 12,
  border: "none",
  background: "#16a34a",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 14,
};