import { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { useAuthCtx } from "./context/AuthContext";
import AuthModal from "./components/AuthModal";
import UsernameModal from "./components/UsernameModal";

// =========================
// Fix icon Leaflet mặc định
// =========================
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const defaultCenter = [21.29254772834021, 105.58421695202658];
const radiusInMeters = 6000;
const mapBounds = [
  [21.2325, 105.5242],
  [21.3525, 105.6442],
];

const categories = [
  { value: "cafe", label: "☕ Cà phê", color: "#8b5cf6" },
  { value: "an_uong", label: "🍜 Ăn uống", color: "#ef4444" },
  { value: "hoc_tap", label: "📚 Học tập", color: "#3b82f6" },
  { value: "giai_tri", label: "🎮 Giải trí", color: "#eab308" },
  { value: "photocopy", label: "📠 Photocopy", color: "#10b981" },
  { value: "khac", label: "📍 Khác", color: "#64748b" },
];

const emptyPlaceDraft = {
  id: null,
  name: "",
  note: "",
  lat: "",
  lng: "",
  category: "cafe",
  media: [],
  googleMapsLink: "",
  exactLat: "",
  exactLng: "",
};

const emptyReviewDraft = {
  id: null,
  markerId: "",
  rating: 0,
  content: "",
  media: [],
};

// =========================
// Helpers
// =========================
function getCategoryInfo(category) {
  return (
    categories.find((c) => c.value === category) ||
    categories[categories.length - 1]
  );
}

function getCategoryEmoji(category) {
  return getCategoryInfo(category).label.split(" ")[0] || "📍";
}

function getCategoryLabel(category) {
  return getCategoryInfo(category).label;
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatDateTime(value) {
  if (!value) return "";
  try {
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("vi-VN");
  } catch {
    return "";
  }
}

function getDistanceInMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getRatingLabel(rating) {
  switch (rating) {
    case 1:
      return "Rất tệ";
    case 2:
      return "Tạm được";
    case 3:
      return "Ổn";
    case 4:
      return "Tốt";
    case 5:
      return "Rất tốt";
    default:
      return "Chưa đánh giá";
  }
}

function renderStars(value) {
  const safeValue = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return "★".repeat(safeValue) + "☆".repeat(5 - safeValue);
}

function getInitials(name) {
  if (!name) return "U";
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "U";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function getAvatarSource(profile, firebaseUser) {
  return profile?.avatar || profile?.photoURL || firebaseUser?.photoURL || "";
}

function createPlaceIcon(place, isActive = false) {
  const safeName = (place.name || "Địa điểm").replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])
  );

  const categoryInfo = getCategoryInfo(place.category);
  const emoji = getCategoryEmoji(place.category);

  const glow = isActive
    ? "0 0 0 5px rgba(37,99,235,0.22), 0 10px 24px rgba(0,0,0,0.28)"
    : "0 2px 8px rgba(0,0,0,0.25)";

  return L.divIcon({
    className: "",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-8px);">
        <div style="
          width:46px;
          height:46px;
          border-radius:999px;
          background:${categoryInfo.color};
          color:white;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:24px;
          font-weight:700;
          border:3px solid #fff;
          box-shadow:${glow};
        ">
          ${emoji}
        </div>
        <div style="
          margin-top:6px;
          background:#ffffff;
          padding:4px 9px;
          border-radius:999px;
          font-size:12px;
          font-weight:600;
          color:#111827;
          box-shadow:0 2px 8px rgba(0,0,0,0.18);
          white-space:nowrap;
          max-width:155px;
          overflow:hidden;
          text-overflow:ellipsis;
          border:1px solid #e5e7eb;
        ">
          ${safeName}
        </div>
      </div>`,
    iconSize: [155, 74],
    iconAnchor: [23, 58],
    popupAnchor: [0, -50],
  });
}

function normalizeMediaItem(item, fallbackIdPrefix = "media") {
  if (!item) return null;

  if (typeof item === "string") {
    return {
      id: `${fallbackIdPrefix}-${Math.random()}`,
      url: item,
      type: item.startsWith("data:video") ? "video" : "image",
    };
  }

  if (typeof item === "object" && item.url) {
    return {
      id:
        item.id ||
        `${fallbackIdPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url: item.url,
      type:
        item.type ||
        (String(item.url).startsWith("data:video") ? "video" : "image"),
      name: item.name || "",
    };
  }

  return null;
}

function normalizeMediaArray(arr, prefix = "media") {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => normalizeMediaItem(item, prefix)).filter(Boolean);
}

async function fileToBase64Media(file) {
  const type = file.type.startsWith("video/") ? "video" : "image";
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    url,
    name: file.name || "",
  };
}

function resolveFinalCoords(draft) {
  const exactLat = safeNumber(draft.exactLat);
  const exactLng = safeNumber(draft.exactLng);

  if (exactLat !== null && exactLng !== null) {
    return {
      lat: exactLat,
      lng: exactLng,
      exactLat,
      exactLng,
    };
  }

  return {
    lat: safeNumber(draft.lat),
    lng: safeNumber(draft.lng),
    exactLat: null,
    exactLng: null,
  };
}

function isValidGoogleMapsLink(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      url.hostname.includes("google.") ||
      url.hostname.includes("goo.gl") ||
      url.hostname.includes("maps.app.goo.gl")
    );
  } catch {
    return false;
  }
}

// =========================
// Icon nhỏ
// =========================
function LogoutIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 16L19 12L14 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 12H9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CameraIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 4L7.5 6H5C3.89543 6 3 6.89543 3 8V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V8C21 6.89543 20.1046 6 19 6H16.5L15 4H9Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ChevronDownIcon({ size = 16, open = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.22s ease",
      }}
    >
      <path
        d="M6 9L12 15L18 9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// =========================
// Components nhỏ
// =========================
function MapClickHandler({ onMapPointClick }) {
  useMapEvents({
    click(e) {
      onMapPointClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToMarker({ target }) {
  const map = useMap();

  useEffect(() => {
    if (target?.lat && target?.lng) {
      map.flyTo([target.lat, target.lng], 16, { duration: 1.2 });
    }
  }, [target, map]);

  return null;
}

function FixMapSize() {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => map.invalidateSize();

    setTimeout(invalidate, 100);
    setTimeout(invalidate, 300);
    setTimeout(invalidate, 600);

    window.addEventListener("resize", invalidate);
    return () => window.removeEventListener("resize", invalidate);
  }, [map]);

  return null;
}

function MapController({ mapRef }) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);

  return null;
}

function ModalShell({ children, onClose, maxWidth = 920 }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2800,
        background: "rgba(15,23,42,0.56)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "92svh",
          overflow: "hidden",
          borderRadius: 28,
          background: "#fff",
          boxShadow: "0 24px 64px rgba(15,23,42,0.28)",
          border: "1px solid #e5e7eb",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 18,
            zIndex: 2,
            width: 38,
            height: 38,
            borderRadius: 999,
            border: "none",
            background: "#f1f5f9",
            fontSize: 24,
            cursor: "pointer",
            color: "#334155",
          }}
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

function MediaPreviewItem({ item, onRemove, showRemove = true }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: 14,
        overflow: "hidden",
        background: "#f8fafc",
      }}
    >
      {item.type === "image" ? (
        <img
          src={item.url}
          alt="media"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <video
          src={item.url}
          controls
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}

      {showRemove && (
        <button
          type="button"
          onClick={() => onRemove?.(item.id)}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 28,
            height: 28,
            borderRadius: 999,
            border: "none",
            background: "rgba(15,23,42,0.82)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
          title="Xóa media"
        >
          ×
        </button>
      )}
    </div>
  );
}

function StarRatingInput({ value, onChange, size = 34, center = true }) {
  const [hoverValue, setHoverValue] = useState(0);

  return (
    <div style={{ textAlign: center ? "center" : "left", margin: "14px 0 18px" }}>
      <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
        Chọn số sao
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: center ? "center" : "flex-start",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const active = hoverValue ? star <= hoverValue : star <= value;

          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              onMouseEnter={() => setHoverValue(star)}
              onMouseLeave={() => setHoverValue(0)}
              style={{
                background: "none",
                border: "none",
                fontSize: size,
                cursor: "pointer",
                color: active ? "#f59e0b" : "#d1d5db",
                lineHeight: 1,
                padding: 0,
              }}
            >
              ★
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 6, fontSize: 14, color: "#64748b" }}>
        {value > 0 ? `${value}/5 - ${getRatingLabel(value)}` : "Chưa đánh giá"}
      </div>
    </div>
  );
}

function ReviewCard({ review }) {
  const avatar = review.userAvatar || "";
  const username = review.username || review.userEmail || "Người dùng";

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 20,
        padding: 16,
        boxShadow: "0 6px 18px rgba(15,23,42,0.05)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            background:
              "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.85))",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt={username}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span>{getInitials(username)}</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "#0f172a",
              wordBreak: "break-word",
            }}
          >
            {username}
          </div>

          <div
            style={{
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "#f59e0b", fontSize: 18 }}>
              {renderStars(review.rating)}
            </span>
            <span style={{ fontSize: 12.5, color: "#64748b" }}>
              {formatDateTime(review.updatedAt || review.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {review.content && (
        <div
          style={{
            marginTop: 12,
            fontSize: 14,
            lineHeight: 1.65,
            color: "#334155",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {review.content}
        </div>
      )}

      {review.media?.length > 0 && (
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 10,
          }}
        >
          {review.media.map((item) => (
            <div
              key={item.id}
              style={{
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
              }}
            >
              {item.type === "image" ? (
                <img
                  src={item.url}
                  alt="review media"
                  style={{ width: "100%", height: 120, objectFit: "cover" }}
                />
              ) : (
                <video
                  src={item.url}
                  controls
                  style={{ width: "100%", height: 120, objectFit: "cover" }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewEditorModal({
  marker,
  reviewDraft,
  setReviewDraft,
  onClose,
  onSubmit,
  reviewSaving,
  reviewMediaInputRef,
  onUploadReviewMedia,
  onRemoveReviewMedia,
  isEditingReview,
}) {
  return (
    <ModalShell onClose={onClose} maxWidth={920}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          minHeight: "min(88svh, 760px)",
        }}
      >
        <div
          style={{
            padding: "28px 24px 24px",
            overflowY: "auto",
            borderRight: "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a" }}>
            {isEditingReview ? "Chỉnh sửa đánh giá" : "Viết đánh giá"}
          </div>

          <div style={{ marginTop: 8, fontSize: 14, color: "#64748b" }}>
            Địa điểm: <strong>{marker?.name || "Địa điểm"}</strong>
          </div>

          <StarRatingInput
            value={reviewDraft.rating}
            onChange={(rating) =>
              setReviewDraft((prev) => ({
                ...prev,
                rating,
              }))
            }
          />

          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontWeight: 700,
                marginBottom: 8,
                color: "#1e293b",
              }}
            >
              Nội dung đánh giá
            </div>

            <textarea
              placeholder="Hãy chia sẻ trải nghiệm của bạn về địa điểm này..."
              value={reviewDraft.content}
              onChange={(e) =>
                setReviewDraft((prev) => ({
                  ...prev,
                  content: e.target.value,
                }))
              }
              style={{
                width: "100%",
                minHeight: 220,
                padding: "14px 16px",
                borderRadius: 16,
                border: "1px solid #cbd5e1",
                fontSize: 15,
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button
              type="button"
              onClick={onSubmit}
              disabled={reviewSaving}
              style={{
                flex: 1,
                padding: "15px",
                background: reviewSaving ? "#93c5fd" : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 14,
                fontWeight: 800,
                fontSize: 15,
                cursor: reviewSaving ? "not-allowed" : "pointer",
              }}
            >
              {reviewSaving
                ? "Đang lưu..."
                : isEditingReview
                ? "Cập nhật đánh giá"
                : "Gửi đánh giá"}
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "15px",
                background: "#fff",
                color: "#334155",
                border: "1px solid #cbd5e1",
                borderRadius: 14,
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Hủy
            </button>
          </div>
        </div>

        <div
          style={{
            padding: "28px 20px 24px",
            overflowY: "auto",
            background: "#f8fafc",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>
            Ảnh / video review
          </div>

          <div
            style={{
              marginTop: 8,
              fontSize: 14,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Bạn có thể đính kèm ảnh hoặc video thực tế để review trực quan hơn.
          </div>

          <label
            style={{
              marginTop: 16,
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              background: "#e0f2fe",
              padding: "10px 16px",
              borderRadius: 14,
              cursor: "pointer",
              flexWrap: "wrap",
            }}
          >
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              ref={reviewMediaInputRef}
              onChange={onUploadReviewMedia}
              style={{ display: "none" }}
            />

            <span
              style={{
                background: "#0284c7",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Chọn media
            </span>

            <span style={{ color: "#475569", fontSize: 14 }}>
              {reviewDraft.media?.length
                ? `${reviewDraft.media.length} media đã chọn`
                : "Chưa có media"}
            </span>
          </label>

          {reviewDraft.media?.length > 0 ? (
            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                gap: 12,
              }}
            >
              {reviewDraft.media.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    padding: 8,
                    boxShadow: "0 6px 18px rgba(15,23,42,0.06)",
                  }}
                >
                  <MediaPreviewItem
                    item={item}
                    onRemove={onRemoveReviewMedia}
                    showRemove
                  />
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                marginTop: 18,
                border: "2px dashed #cbd5e1",
                borderRadius: 18,
                padding: "28px 18px",
                background: "#fff",
                textAlign: "center",
                color: "#64748b",
              }}
            >
              <div style={{ fontSize: 34, marginBottom: 8 }}>🖼️</div>
              <div style={{ fontWeight: 800, color: "#334155", marginBottom: 6 }}>
                Chưa có media review
              </div>
              <div style={{ fontSize: 14 }}>
                Thêm ảnh hoặc video để review rõ ràng hơn.
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function ReviewsViewerModal({
  marker,
  reviews,
  averageRating,
  onClose,
  onWriteReview,
  isLoggedIn,
  myReview,
}) {
  return (
    <ModalShell onClose={onClose} maxWidth={980}>
      <div style={{ padding: "28px 24px 24px", maxHeight: "92svh", overflow: "auto" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: getCategoryInfo(marker?.category).color,
              color: "#fff",
              fontSize: 34,
              flexShrink: 0,
            }}
          >
            {getCategoryEmoji(marker?.category)}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: "#0f172a",
                wordBreak: "break-word",
              }}
            >
              Review địa điểm
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: 16,
                fontWeight: 700,
                color: "#334155",
              }}
            >
              {marker?.name || "Địa điểm"}
            </div>

            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 28, color: "#f59e0b", fontWeight: 900 }}>
                {averageRating.toFixed(1)}
              </span>
              <span style={{ color: "#f59e0b", fontSize: 22 }}>
                {renderStars(Math.round(averageRating))}
              </span>
              <span style={{ fontSize: 14, color: "#64748b" }}>
                {reviews.length} đánh giá
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onWriteReview}
            style={{
              padding: "13px 18px",
              borderRadius: 14,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {myReview ? "Sửa đánh giá của tôi" : "Viết đánh giá"}
          </button>
        </div>

        {!isLoggedIn && (
          <div
            style={{
              marginTop: 18,
              padding: "12px 14px",
              borderRadius: 14,
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
              color: "#64748b",
              fontSize: 14,
            }}
          >
            Đăng nhập để viết đánh giá cho địa điểm này.
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          {reviews.length === 0 ? (
            <div
              style={{
                border: "1px dashed #cbd5e1",
                borderRadius: 18,
                background: "#f8fafc",
                padding: "30px 20px",
                textAlign: "center",
                color: "#64748b",
              }}
            >
              Chưa có đánh giá nào cho địa điểm này.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 14,
              }}
            >
              {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function PlacePopup({
  marker,
  onEdit,
  onDelete,
  canEditMap,
  isLoggedIn,
  onOpenWriteReview,
  onOpenReviews,
  averageRating,
  reviewCount,
}) {
  return (
    <div style={{ width: 300, color: "#0f172a" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            background: getCategoryInfo(marker.category).color,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {getCategoryEmoji(marker.category)}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.3 }}>
            {marker.name}
          </div>

          <div style={{ marginTop: 4, fontSize: 13, color: "#475569" }}>
            {getCategoryLabel(marker.category)}
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#f59e0b", fontSize: 18 }}>
              {renderStars(Math.round(averageRating || 0))}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
              Trung bình: {(averageRating || 0).toFixed(1)}/5 • {reviewCount} đánh giá
            </div>
          </div>
        </div>
      </div>

      {marker.note && (
        <p
          style={{
            marginTop: 12,
            fontSize: 14,
            lineHeight: 1.55,
            color: "#334155",
          }}
        >
          {marker.note}
        </p>
      )}

      {marker.media?.length > 0 && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {marker.media.slice(0, 6).map((item) =>
            item.type === "image" ? (
              <img
                key={item.id}
                src={item.url}
                alt="media"
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 12,
                  objectFit: "cover",
                  border: "1px solid #e5e7eb",
                  flex: "0 0 auto",
                }}
              />
            ) : (
              <video
                key={item.id}
                src={item.url}
                controls
                style={{
                  width: 120,
                  height: 80,
                  borderRadius: 12,
                  objectFit: "cover",
                  border: "1px solid #e5e7eb",
                  flex: "0 0 auto",
                }}
              />
            )
          )}
        </div>
      )}

      <div
        style={{
          marginTop: 12,
          fontSize: 12.5,
          color: "#64748b",
          lineHeight: 1.6,
        }}
      >
        <div>
          Tọa độ marker: {Number(marker.lat).toFixed(6)}, {Number(marker.lng).toFixed(6)}
        </div>

        {marker.exactLat !== null && marker.exactLng !== null && (
          <div>
            Tọa độ chính xác: {Number(marker.exactLat).toFixed(6)},{" "}
            {Number(marker.exactLng).toFixed(6)}
          </div>
        )}

        <div>Thêm lúc: {formatDateTime(marker.createdAt)}</div>
        {marker.createdByName && <div>Người thêm: {marker.createdByName}</div>}
      </div>

      {marker.googleMapsLink && (
        <a
          href={marker.googleMapsLink}
          target="_blank"
          rel="noreferrer"
          style={{
            marginTop: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 12,
            background: "#eff6ff",
            color: "#1d4ed8",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          🗺️ Mở trên Google Maps
        </a>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onOpenWriteReview}
          style={{
            flex: 1,
            minWidth: 120,
            padding: "10px 12px",
            background: isLoggedIn ? "#2563eb" : "#e2e8f0",
            color: isLoggedIn ? "#fff" : "#475569",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Viết đánh giá
        </button>

        <button
          type="button"
          onClick={onOpenReviews}
          style={{
            flex: 1,
            minWidth: 120,
            padding: "10px 12px",
            background: "#f8fafc",
            color: "#334155",
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Xem đánh giá
        </button>
      </div>

      {!isLoggedIn && (
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: "#64748b",
            background: "#f8fafc",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          Đăng nhập để viết đánh giá địa điểm này.
        </div>
      )}

      {canEditMap && (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={() => onEdit(marker)}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: "#eab308",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Sửa
          </button>
          <button
            type="button"
            onClick={() => onDelete(marker.id)}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: "#fee2e2",
              color: "#dc2626",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Xóa
          </button>
        </div>
      )}
    </div>
  );
}

// =========================
// App chính
// =========================
export default function App() {
  const {
    isLoggedIn,
    firebaseUser,
    profile,
    role,
    canEditMap,
    logout,
    loading,
  } = useAuthCtx();

  const isAdmin = role === "admin";

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeTab, setActiveTab] = useState("places");
  const [members, setMembers] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [reviews, setReviews] = useState([]);

  const [placeDraft, setPlaceDraft] = useState(emptyPlaceDraft);
  const [reviewDraft, setReviewDraft] = useState(emptyReviewDraft);

  const [message, setMessage] = useState("");
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [tempPoint, setTempPoint] = useState(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [showPlaceForm, setShowPlaceForm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditingPlace, setIsEditingPlace] = useState(false);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [showReviewEditor, setShowReviewEditor] = useState(false);
  const [showReviewsViewer, setShowReviewsViewer] = useState(false);
  const [activeReviewMarkerId, setActiveReviewMarkerId] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const placeMediaInputRef = useRef(null);
  const reviewMediaInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const mapRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const profileMenuRef = useRef(null);

  const avatarSrc = useMemo(
    () => getAvatarSource(profile, firebaseUser),
    [profile, firebaseUser]
  );

  const selectedMarker = useMemo(
    () => markers.find((m) => m.id === selectedMarkerId) || null,
    [markers, selectedMarkerId]
  );

  const activeReviewMarker = useMemo(
    () => markers.find((m) => m.id === activeReviewMarkerId) || null,
    [markers, activeReviewMarkerId]
  );

  const reviewsByMarker = useMemo(() => {
    const grouped = {};
    for (const review of reviews) {
      if (!grouped[review.markerId]) grouped[review.markerId] = [];
      grouped[review.markerId].push(review);
    }
    return grouped;
  }, [reviews]);

  const markerStatsMap = useMemo(() => {
    const map = {};
    for (const marker of markers) {
      const markerReviews = reviewsByMarker[marker.id] || [];
      const reviewCount = markerReviews.length;
      const averageRating =
        reviewCount > 0
          ? markerReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) /
            reviewCount
          : 0;

      map[marker.id] = {
        reviewCount,
        averageRating,
      };
    }
    return map;
  }, [markers, reviewsByMarker]);

  const filteredMarkers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    const list = markers.filter((m) => {
      const matchSearch =
        !keyword ||
        m.name.toLowerCase().includes(keyword) ||
        (m.note && m.note.toLowerCase().includes(keyword));

      const matchCategory =
        categoryFilter === "all" || m.category === categoryFilter;

      return matchSearch && matchCategory;
    });

    if (sortBy === "rating") {
      list.sort(
        (a, b) =>
          (markerStatsMap[b.id]?.averageRating || 0) -
          (markerStatsMap[a.id]?.averageRating || 0)
      );
    } else if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    } else {
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return list;
  }, [markers, searchTerm, categoryFilter, sortBy, markerStatsMap]);

  const totalStats = useMemo(() => {
    const ratedMarkers = markers.filter(
      (m) => (markerStatsMap[m.id]?.reviewCount || 0) > 0
    );

    const avgRating =
      ratedMarkers.length > 0
        ? (
            ratedMarkers.reduce(
              (sum, marker) =>
                sum + (markerStatsMap[marker.id]?.averageRating || 0),
              0
            ) / ratedMarkers.length
          ).toFixed(1)
        : "0.0";

    return {
      total: markers.length,
      ratedCount: ratedMarkers.length,
      avgRating,
      totalReviews: reviews.length,
    };
  }, [markers, reviews.length, markerStatsMap]);

  const getReviewsForMarker = (markerId) => {
    const list = reviewsByMarker[markerId] || [];
    return [...list].sort((a, b) => {
      const timeA = new Date(
        a.updatedAt?.toDate ? a.updatedAt.toDate() : a.updatedAt || a.createdAt || 0
      ).getTime();
      const timeB = new Date(
        b.updatedAt?.toDate ? b.updatedAt.toDate() : b.updatedAt || b.createdAt || 0
      ).getTime();
      return timeB - timeA;
    });
  };

  const getMyReviewForMarker = (markerId) => {
    if (!firebaseUser?.uid) return null;
    return (
      reviews.find(
        (review) =>
          review.markerId === markerId && review.userId === firebaseUser.uid
      ) || null
    );
  };

  const showMessage = (text) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setMessage(text);
    toastTimeoutRef.current = setTimeout(() => setMessage(""), 2500);
  };

  useEffect(() => {
    document.title = "UTT Life Map";
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isAdmin && activeTab === "members") {
      setActiveTab("places");
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target)
      ) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load users cho admin
  useEffect(() => {
    if (!isAdmin) {
      setMembers([]);
      return;
    }

    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      list.sort((a, b) =>
        (a.username || a.email || "").localeCompare(
          b.username || b.email || "",
          "vi"
        )
      );

      setMembers(list);
    });

    return () => unsub();
  }, [isAdmin]);

  // Load markers realtime
  useEffect(() => {
    const q = query(collection(db, "markers"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((item) => {
            const data = item.data();
            const lat = safeNumber(data.lat);
            const lng = safeNumber(data.lng);
            if (lat === null || lng === null) return null;

            return {
              id: item.id,
              name: typeof data.name === "string" ? data.name : "Địa điểm",
              note: typeof data.note === "string" ? data.note : "",
              lat,
              lng,
              category:
                typeof data.category === "string" ? data.category : "khac",
              media: normalizeMediaArray(data.media, `marker-${item.id}`),
              createdAt: data.createdAt?.toDate
                ? data.createdAt.toDate().toISOString()
                : data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || null,
              createdBy: data.createdBy || null,
              createdByName: data.createdByName || "",
              googleMapsLink:
                typeof data.googleMapsLink === "string"
                  ? data.googleMapsLink
                  : "",
              exactLat:
                data.exactLat === null || data.exactLat === undefined
                  ? null
                  : safeNumber(data.exactLat),
              exactLng:
                data.exactLng === null || data.exactLng === undefined
                  ? null
                  : safeNumber(data.exactLng),
            };
          })
          .filter(Boolean);

        setMarkers(list);
      },
      (error) => {
        console.error("Markers snapshot error:", error);
        showMessage("❌ Không tải được dữ liệu địa điểm");
      }
    );

    return () => unsub();
  }, []);

  // Load reviews realtime
  useEffect(() => {
    const q = query(collection(db, "reviews"), orderBy("updatedAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            markerId: data.markerId || "",
            userId: data.userId || "",
            username: data.username || "",
            userAvatar: data.userAvatar || "",
            userEmail: data.userEmail || "",
            rating: Number(data.rating) || 0,
            content: data.content || "",
            media: normalizeMediaArray(data.media, `review-${item.id}`),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });

        setReviews(list);
      },
      (error) => {
        console.error("Reviews snapshot error:", error);
        showMessage("❌ Không tải được reviews");
      }
    );

    return () => unsub();
  }, []);

  // CSS fix + responsive
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-utt-leaflet-fix", "true");
    styleEl.textContent = `
      .utt-map-scope,
      .utt-map-scope * {
        box-sizing: border-box;
        mix-blend-mode: normal;
      }

      .utt-map-scope .leaflet-container,
      .utt-map-scope .leaflet-map-pane,
      .utt-map-scope .leaflet-tile-pane,
      .utt-map-scope .leaflet-pane,
      .utt-map-scope .leaflet-layer {
        filter: none !important;
      }

      .utt-map-scope .leaflet-container img,
      .utt-map-scope .leaflet-pane img,
      .utt-map-scope .leaflet-tile {
        max-width: none !important;
        filter: none !important;
        mix-blend-mode: normal !important;
        opacity: 1 !important;
      }

      .utt-map-scope .leaflet-tile {
        width: 256px !important;
        height: 256px !important;
        display: block !important;
        visibility: visible !important;
      }

      .utt-map-scope .leaflet-marker-icon,
      .utt-map-scope .leaflet-marker-shadow {
        max-width: none !important;
        filter: none !important;
      }

      .utt-map-scope .leaflet-container {
        background: #dbeafe;
        isolation: isolate;
      }

      .utt-map-scope .utt-place-form-grid {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
      }

      .utt-map-scope .utt-review-form-grid {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
      }

      .utt-map-scope .utt-profile-name {
        max-width: 140px;
      }

      @media (max-width: 900px) {
        .utt-map-scope .utt-place-form-grid,
        .utt-map-scope .utt-review-form-grid {
          grid-template-columns: 1fr !important;
        }
      }

      @media (max-width: 640px) {
        .utt-map-scope .utt-top-title {
          max-width: calc(100vw - 100px);
        }

        .utt-map-scope .utt-profile-name {
          max-width: 92px;
        }

        .utt-map-scope .utt-app-title-box {
          left: 16px !important;
          right: 16px !important;
          top: 80px !important;
          width: auto !important;
        }

        .utt-map-scope .utt-profile-shell {
          top: 14px !important;
          right: 14px !important;
        }

        .utt-map-scope .utt-profile-dropdown {
          right: 0 !important;
          width: min(90vw, 320px) !important;
        }

        .utt-map-scope .utt-my-location-btn {
          bottom: 18px !important;
          right: 18px !important;
        }
      }
    `;
    document.head.appendChild(styleEl);

    return () => styleEl.remove();
  }, []);

  const requireLogin = () => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      showMessage("❌ Hãy đăng nhập để tiếp tục");
      return false;
    }
    return true;
  };

  const requireEditPermission = () => {
    if (!requireLogin()) return false;
    if (!canEditMap) {
      showMessage("❌ Bạn không có quyền thêm, sửa hoặc xóa địa điểm");
      return false;
    }
    return true;
  };

  const resetPlaceDraft = () => {
    setPlaceDraft(emptyPlaceDraft);
    setTempPoint(null);
    setShowConfirm(false);
    setShowPlaceForm(false);
    setIsEditingPlace(false);
    if (placeMediaInputRef.current) placeMediaInputRef.current.value = "";
  };

  const resetReviewDraft = () => {
    setReviewDraft(emptyReviewDraft);
    if (reviewMediaInputRef.current) reviewMediaInputRef.current.value = "";
  };

  const handleMapPointClick = (lat, lng) => {
    if (!requireEditPermission()) return;

    if (
      getDistanceInMeters(defaultCenter[0], defaultCenter[1], lat, lng) >
      radiusInMeters
    ) {
      showMessage("❌ Chỉ được thêm trong bán kính 6km quanh UTT");
      return;
    }

    setPlaceDraft((prev) => ({
      ...emptyPlaceDraft,
      ...prev,
      id: null,
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
      exactLat: "",
      exactLng: "",
      googleMapsLink: "",
    }));

    setTempPoint([lat, lng]);
    setIsEditingPlace(false);
    setShowConfirm(true);
  };

  const handleCancelAddLocation = () => {
    setShowConfirm(false);
    setTempPoint(null);
    setPlaceDraft((prev) => ({ ...prev, lat: "", lng: "" }));
    showMessage("Đã hủy");
  };

  const openCreateFormAtPoint = () => {
    if (!requireEditPermission()) return;
    setShowConfirm(false);
    setShowPlaceForm(true);
  };

  const handlePlaceMediaUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    if (!validFiles.length) {
      showMessage("❌ Chỉ hỗ trợ ảnh hoặc video");
      return;
    }

    try {
      const uploadedMedia = await Promise.all(validFiles.map(fileToBase64Media));

      setPlaceDraft((prev) => ({
        ...prev,
        media: [...(prev.media || []), ...uploadedMedia],
      }));

      if (placeMediaInputRef.current) placeMediaInputRef.current.value = "";
      showMessage(`✅ Đã thêm ${uploadedMedia.length} media`);
    } catch (error) {
      console.error("Place media upload error:", error);
      showMessage("❌ Không xử lý được media");
    }
  };

  const removePlaceDraftMedia = (mediaId) => {
    setPlaceDraft((prev) => ({
      ...prev,
      media: (prev.media || []).filter((item) => item.id !== mediaId),
    }));
  };

  const handleReviewMediaUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    if (!validFiles.length) {
      showMessage("❌ Chỉ hỗ trợ ảnh hoặc video");
      return;
    }

    try {
      const uploadedMedia = await Promise.all(validFiles.map(fileToBase64Media));

      setReviewDraft((prev) => ({
        ...prev,
        media: [...(prev.media || []), ...uploadedMedia],
      }));

      if (reviewMediaInputRef.current) reviewMediaInputRef.current.value = "";
      showMessage(`✅ Đã thêm ${uploadedMedia.length} media review`);
    } catch (error) {
      console.error("Review media upload error:", error);
      showMessage("❌ Không xử lý được media review");
    }
  };

  const removeReviewDraftMedia = (mediaId) => {
    setReviewDraft((prev) => ({
      ...prev,
      media: (prev.media || []).filter((item) => item.id !== mediaId),
    }));
  };

  // Avatar base64
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isLoggedIn || !firebaseUser?.uid) {
      showMessage("❌ Bạn cần đăng nhập để cập nhật avatar");
      return;
    }

    if (!file.type.startsWith("image/")) {
      showMessage("❌ Vui lòng chọn file ảnh");
      return;
    }

    const maxSizeMB = 2;
    if (file.size > maxSizeMB * 1024 * 1024) {
      showMessage("❌ Ảnh quá lớn, vui lòng chọn ảnh dưới 2MB");
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }

    try {
      setAvatarUploading(true);

      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await setDoc(
        doc(db, "users", firebaseUser.uid),
        {
          avatar: base64,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      showMessage("✅ Đã cập nhật avatar");
      setShowProfileMenu(false);
    } catch (error) {
      console.error("Upload avatar error:", error);
      showMessage("❌ Không thể cập nhật avatar");
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const saveMarker = async () => {
    if (!requireEditPermission()) return;

    if (!placeDraft.name.trim()) {
      showMessage("❌ Vui lòng nhập tên địa điểm");
      return;
    }

    if (
      canEditMap &&
      placeDraft.googleMapsLink &&
      !isValidGoogleMapsLink(placeDraft.googleMapsLink.trim())
    ) {
      showMessage("❌ Link Google Maps không hợp lệ");
      return;
    }

    const coords = resolveFinalCoords(placeDraft);
    const finalLat = coords.lat;
    const finalLng = coords.lng;

    if (finalLat === null || finalLng === null) {
      showMessage("❌ Tọa độ không hợp lệ");
      return;
    }

    if (
      getDistanceInMeters(defaultCenter[0], defaultCenter[1], finalLat, finalLng) >
      radiusInMeters
    ) {
      showMessage("❌ Vị trí ngoài bán kính cho phép");
      return;
    }

    try {
      const payload = {
        name: placeDraft.name.trim(),
        note: placeDraft.note.trim(),
        lat: finalLat,
        lng: finalLng,
        category: placeDraft.category,
        media: normalizeMediaArray(placeDraft.media, "marker-save"),
        updatedAt: serverTimestamp(),
      };

      if (canEditMap) {
        payload.googleMapsLink = placeDraft.googleMapsLink.trim();
        payload.exactLat = coords.exactLat;
        payload.exactLng = coords.exactLng;
      }

      if (isEditingPlace && placeDraft.id) {
        await updateDoc(doc(db, "markers", String(placeDraft.id)), payload);
        setSelectedMarkerId(placeDraft.id);
        showMessage("✅ Đã cập nhật địa điểm");
      } else {
        const docRef = await addDoc(collection(db, "markers"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: firebaseUser?.uid || null,
          createdByName: profile?.username || firebaseUser?.email || "Ẩn danh",
        });
        setSelectedMarkerId(docRef.id);
        showMessage("✅ Đã thêm địa điểm thành công");
      }

      resetPlaceDraft();
    } catch (error) {
      console.error("Save marker error:", error);
      showMessage("❌ Không lưu được địa điểm");
    }
  };

  const startEdit = (marker) => {
    if (!requireEditPermission()) return;

    setPlaceDraft({
      id: marker.id,
      name: marker.name || "",
      note: marker.note || "",
      lat: String(marker.lat ?? ""),
      lng: String(marker.lng ?? ""),
      category: marker.category || "khac",
      media: normalizeMediaArray(marker.media, `marker-edit-${marker.id}`),
      googleMapsLink: marker.googleMapsLink || "",
      exactLat:
        marker.exactLat !== null && marker.exactLat !== undefined
          ? String(marker.exactLat)
          : "",
      exactLng:
        marker.exactLng !== null && marker.exactLng !== undefined
          ? String(marker.exactLng)
          : "",
    });

    setTempPoint([marker.lat, marker.lng]);
    setIsEditingPlace(true);
    setShowPlaceForm(true);
    setShowMenu(false);
    setShowConfirm(false);

    if (mapRef.current) {
      mapRef.current.flyTo([marker.lat, marker.lng], 16, { duration: 1.2 });
    }
  };

  const deleteMarker = async (id) => {
    if (!requireEditPermission()) return;
    if (!window.confirm("Xóa địa điểm này?")) return;

    try {
      const relatedReviews = reviews.filter((review) => review.markerId === id);

      if (relatedReviews.length > 0) {
        const batch = writeBatch(db);
        relatedReviews.forEach((review) => {
          batch.delete(doc(db, "reviews", review.id));
        });
        batch.delete(doc(db, "markers", String(id)));
        await batch.commit();
      } else {
        await deleteDoc(doc(db, "markers", String(id)));
      }

      if (selectedMarkerId === id) setSelectedMarkerId(null);
      if (activeReviewMarkerId === id) {
        setActiveReviewMarkerId(null);
        setShowReviewsViewer(false);
        setShowReviewEditor(false);
      }

      showMessage("🗑️ Đã xóa địa điểm");
    } catch (error) {
      console.error("Delete marker error:", error);
      showMessage("❌ Xóa địa điểm thất bại");
    }
  };

  const openWriteReview = (markerId) => {
    if (!requireLogin()) return;

    const marker = markers.find((m) => m.id === markerId);
    if (!marker) {
      showMessage("❌ Không tìm thấy địa điểm");
      return;
    }

    const existing = getMyReviewForMarker(markerId);

    setActiveReviewMarkerId(markerId);
    setReviewDraft({
      id: existing?.id || null,
      markerId,
      rating: existing?.rating || 0,
      content: existing?.content || "",
      media: normalizeMediaArray(existing?.media || [], `review-draft-${markerId}`),
    });
    setShowReviewEditor(true);
  };

  const openReviewsViewer = (markerId) => {
    setActiveReviewMarkerId(markerId);
    setShowReviewsViewer(true);
  };

  const submitReview = async () => {
    if (!requireLogin()) return;
    if (!activeReviewMarkerId) return;

    if (!reviewDraft.rating || reviewDraft.rating < 1 || reviewDraft.rating > 5) {
      showMessage("❌ Vui lòng chọn số sao");
      return;
    }

    try {
      setReviewSaving(true);

      const existing =
        reviewDraft.id || getMyReviewForMarker(activeReviewMarkerId)?.id || null;

      const payload = {
        markerId: activeReviewMarkerId,
        userId: firebaseUser.uid,
        username: profile?.username || firebaseUser?.displayName || "Người dùng",
        userAvatar: avatarSrc || "",
        userEmail: firebaseUser?.email || "",
        rating: Number(reviewDraft.rating),
        content: reviewDraft.content.trim(),
        media: normalizeMediaArray(reviewDraft.media, "review-save"),
        updatedAt: serverTimestamp(),
      };

      if (existing) {
        await updateDoc(doc(db, "reviews", existing), payload);
        showMessage("✅ Đã cập nhật đánh giá");
      } else {
        await addDoc(collection(db, "reviews"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        showMessage("✅ Đã gửi đánh giá");
      }

      setShowReviewEditor(false);
      setShowReviewsViewer(true);
      resetReviewDraft();
    } catch (error) {
      console.error("Submit review error:", error);
      showMessage("❌ Không lưu được đánh giá");
    } finally {
      setReviewSaving(false);
    }
  };

  const focusMarker = (marker) => {
    setSelectedMarkerId(marker.id);
    setShowMenu(false);
    if (mapRef.current) {
      mapRef.current.flyTo([marker.lat, marker.lng], 16, { duration: 1.2 });
    }
  };

  const setModerator = async (userId) => {
    if (!isAdmin) {
      showMessage("❌ Chỉ admin mới được quản lý thành viên");
      return;
    }

    try {
      await updateDoc(doc(db, "users", userId), { role: "moderator" });
      showMessage("✅ Đã chuyển thành Moderator");
    } catch (error) {
      console.error("Set moderator error:", error);
      showMessage("❌ Không cập nhật được quyền");
    }
  };

  const removeModerator = async (userId) => {
    if (!isAdmin) {
      showMessage("❌ Chỉ admin mới được quản lý thành viên");
      return;
    }

    try {
      await updateDoc(doc(db, "users", userId), { role: "user" });
      showMessage("✅ Đã hạ về User");
    } catch (error) {
      console.error("Remove moderator error:", error);
      showMessage("❌ Không cập nhật được quyền");
    }
  };

  const goToMyLocation = () => {
    if (!navigator.geolocation) {
      showMessage("❌ Trình duyệt không hỗ trợ định vị");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;

        if (mapRef.current) {
          mapRef.current.flyTo([latitude, longitude], 16, { duration: 1.2 });
        }

        showMessage(
          `📍 Vị trí của bạn: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
        );
      },
      () => showMessage("❌ Không lấy được vị trí"),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          color: "#334155",
          background: "#f8fafc",
        }}
      >
        Đang tải UTT Life Map...
      </div>
    );
  }

  const activeReviews = activeReviewMarkerId
    ? getReviewsForMarker(activeReviewMarkerId)
    : [];
  const activeStats = activeReviewMarkerId
    ? markerStatsMap[activeReviewMarkerId] || { reviewCount: 0, averageRating: 0 }
    : { reviewCount: 0, averageRating: 0 };
  const myActiveReview = activeReviewMarkerId
    ? getMyReviewForMarker(activeReviewMarkerId)
    : null;

  return (
    <div
      className="utt-map-scope"
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100svh",
        background: "#f8fafc",
        overflow: "hidden",
      }}
    >
      {/* Góc trên trái */}
      {!showMenu && (
        <>
          <button
            onClick={() => setShowMenu((prev) => !prev)}
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              zIndex: 2000,
              width: 52,
              height: 52,
              borderRadius: 14,
              border: "none",
              background: "#fff",
              boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
              fontSize: 26,
              cursor: "pointer",
            }}
            title="Mở menu"
          >
            ☰
          </button>

          {!isLoggedIn && (
            <button
              onClick={() => setShowAuthModal(true)}
              style={{
                position: "absolute",
                top: 16,
                left: 80,
                zIndex: 2000,
                width: 52,
                height: 52,
                borderRadius: 14,
                border: "none",
                background: "#fff",
                boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                fontSize: 24,
                cursor: "pointer",
              }}
              title="Đăng nhập"
            >
              👤
            </button>
          )}

          <div
            className="utt-app-title-box"
            style={{
              position: "absolute",
              top: 16,
              left: isLoggedIn ? 80 : 144,
              zIndex: 1000,
              background: "rgba(255,255,255,0.98)",
              padding: "12px 20px",
              borderRadius: 18,
              boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
              border: "1px solid #e5e7eb",
              backdropFilter: "blur(8px)",
              textAlign: "left",
            }}
          >
            <h1
              className="utt-top-title"
              style={{
                margin: 0,
                fontSize: 30,
                fontWeight: 900,
                color: "#0f172a",
                lineHeight: 1.1,
              }}
            >
              UTT Life Map
            </h1>

            <div
              style={{
                marginTop: 6,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                fontSize: 13,
                color: "#475569",
              }}
            >
              <span>📍 {totalStats.total} địa điểm</span>
              <span>⭐ {totalStats.avgRating}/5</span>
              <span>📝 {totalStats.totalReviews} review</span>
              <span>
                👤 {isLoggedIn ? profile?.username || firebaseUser?.email : "Khách"}
              </span>
              <span>🛡️ {isLoggedIn ? role : "guest"}</span>
            </div>
          </div>
        </>
      )}

      {/* User profile góc trên phải */}
      {!showMenu && isLoggedIn && (
        <div
          ref={profileMenuRef}
          className="utt-profile-shell"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 2200,
          }}
        >
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            style={{ display: "none" }}
          />

          <button
            type="button"
            onClick={() => setShowProfileMenu((prev) => !prev)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px 8px 8px",
              borderRadius: 999,
              border: "1px solid rgba(226,232,240,0.95)",
              background: "rgba(255,255,255,0.96)",
              boxShadow: "0 14px 32px rgba(15,23,42,0.16)",
              backdropFilter: "blur(8px)",
              cursor: "pointer",
              minHeight: 60,
            }}
            title="Mở profile"
          >
            <div
              onClick={(e) => {
                e.stopPropagation();
                avatarInputRef.current?.click();
              }}
              style={{
                position: "relative",
                width: 46,
                height: 46,
                borderRadius: "50%",
                overflow: "hidden",
                flexShrink: 0,
                border: "2px solid #fff",
                boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                background:
                  "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.85))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 15,
                fontWeight: 800,
              }}
            >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt="avatar"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span>{getInitials(profile?.username || firebaseUser?.email)}</span>
              )}

              <div
                style={{
                  position: "absolute",
                  right: -1,
                  bottom: -1,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#0f172a",
                  color: "#fff",
                  border: "2px solid #fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CameraIcon size={10} />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                minWidth: 0,
              }}
            >
              <div
                className="utt-profile-name"
                style={{
                  fontSize: 14.5,
                  fontWeight: 800,
                  color: "#0f172a",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1.2,
                }}
              >
                {profile?.username || firebaseUser?.email || "Người dùng"}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "#64748b",
                  textTransform: "capitalize",
                }}
              >
                {role || "user"}
              </div>
            </div>

            <div
              style={{
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginLeft: 2,
              }}
            >
              <ChevronDownIcon open={showProfileMenu} />
            </div>
          </button>

          {showProfileMenu && (
            <div
              className="utt-profile-dropdown"
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                right: 0,
                width: 300,
                background: "rgba(255,255,255,0.98)",
                borderRadius: 22,
                border: "1px solid #e5e7eb",
                boxShadow: "0 20px 50px rgba(15,23,42,0.2)",
                overflow: "hidden",
                backdropFilter: "blur(10px)",
              }}
            >
              <div
                style={{
                  padding: 18,
                  borderBottom: "1px solid #eef2f7",
                  background:
                    "linear-gradient(180deg, rgba(239,246,255,0.9), rgba(255,255,255,0.96))",
                }}
              >
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    title="Đổi avatar"
                    style={{
                      width: 74,
                      height: 74,
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: "3px solid #fff",
                      background:
                        "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.85))",
                      boxShadow: "0 10px 24px rgba(37,99,235,0.18)",
                      cursor: avatarUploading ? "not-allowed" : "pointer",
                      padding: 0,
                      position: "relative",
                      flexShrink: 0,
                    }}
                  >
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt="avatar-large"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: 22,
                        }}
                      >
                        {getInitials(profile?.username || firebaseUser?.email)}
                      </div>
                    )}

                    <div
                      style={{
                        position: "absolute",
                        inset: "auto 0 0 0",
                        background: "rgba(15,23,42,0.65)",
                        color: "#fff",
                        fontSize: 11,
                        padding: "6px 0",
                        fontWeight: 700,
                      }}
                    >
                      {avatarUploading ? "Đang tải..." : "Đổi ảnh"}
                    </div>
                  </button>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 17,
                        fontWeight: 800,
                        color: "#0f172a",
                        lineHeight: 1.25,
                        wordBreak: "break-word",
                      }}
                    >
                      {profile?.username || "Người dùng"}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 13.5,
                        color: "#64748b",
                        wordBreak: "break-word",
                      }}
                    >
                      {firebaseUser?.email || "Không có email"}
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 10px",
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        borderRadius: 999,
                        fontSize: 12.5,
                        fontWeight: 700,
                        textTransform: "capitalize",
                      }}
                    >
                      🛡️ {role || "user"}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ padding: 12 }}>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  style={{
                    width: "100%",
                    border: "none",
                    background: "#f8fafc",
                    padding: "13px 14px",
                    borderRadius: 14,
                    cursor: avatarUploading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: "#0f172a",
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      background: "#e0f2fe",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#0369a1",
                      flexShrink: 0,
                    }}
                  >
                    <CameraIcon size={16} />
                  </span>
                  <span>{avatarUploading ? "Đang cập nhật avatar..." : "Đổi avatar"}</span>
                </button>
              </div>

              <div style={{ borderTop: "1px solid #eef2f7", padding: 12 }}>
                <button
                  type="button"
                  onClick={logout}
                  style={{
                    width: "100%",
                    border: "none",
                    background: "#fff1f2",
                    color: "#e11d48",
                    padding: "14px 16px",
                    borderRadius: 16,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    fontWeight: 800,
                    fontSize: 15,
                  }}
                >
                  <LogoutIcon size={18} />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sidebar */}
      {showMenu && (
        <>
          <div
            onClick={() => setShowMenu(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15,23,42,0.4)",
              zIndex: 1100,
            }}
          />

          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 390,
              maxWidth: "92vw",
              height: "100%",
              background: "#fff",
              zIndex: 1300,
              boxShadow: "12px 0 30px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "24px 20px 16px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: "#1e293b",
                  }}
                >
                  Danh sách địa điểm
                </div>

                <div style={{ color: "#64748b", fontSize: 14 }}>
                  {filteredMarkers.length} / {markers.length} địa điểm
                </div>

                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                  {isLoggedIn
                    ? `Xin chào ${profile?.username || firebaseUser?.email}`
                    : "Bạn chưa đăng nhập"}
                </div>
              </div>

              <button
                onClick={() => setShowMenu(false)}
                style={{
                  fontSize: 28,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                padding: 16,
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => setActiveTab("places")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 999,
                    border: activeTab === "places" ? "none" : "1px solid #cbd5e1",
                    background: activeTab === "places" ? "#2563eb" : "#fff",
                    color: activeTab === "places" ? "#fff" : "#334155",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Địa điểm
                </button>

                {isAdmin && (
                  <button
                    onClick={() => setActiveTab("members")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 999,
                      border: activeTab === "members" ? "none" : "1px solid #cbd5e1",
                      background: activeTab === "members" ? "#2563eb" : "#fff",
                      color: activeTab === "members" ? "#fff" : "#334155",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Thành viên
                  </button>
                )}
              </div>

              {activeTab === "places" && (
                <>
                  <input
                    type="text"
                    placeholder="🔎 Tìm kiếm địa điểm..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      border: "1px solid #cbd5e1",
                      fontSize: 15,
                    }}
                  />

                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      style={{
                        flex: 1,
                        padding: 14,
                        borderRadius: 14,
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      <option value="all">Tất cả loại</option>
                      {categories.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      style={{
                        flex: 1,
                        padding: 14,
                        borderRadius: 14,
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      <option value="newest">Mới nhất</option>
                      <option value="rating">Review cao nhất</option>
                      <option value="name">Tên A-Z</option>
                    </select>
                  </div>

                  {!isLoggedIn ? (
                    <button
                      onClick={() => setShowAuthModal(true)}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        border: "none",
                        background: "#2563eb",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Đăng nhập / Đăng ký
                    </button>
                  ) : (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        background: "#f8fafc",
                        border: "1px solid #e5e7eb",
                        fontSize: 14,
                        color: "#334155",
                      }}
                    >
                      Quyền hiện tại:{" "}
                      <strong>{canEditMap ? "Admin / Moderator" : "User"}</strong>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              {activeTab === "members" ? (
                !isAdmin ? (
                  <p style={{ textAlign: "center", color: "#64748b", padding: 30 }}>
                    Bạn không có quyền truy cập mục này
                  </p>
                ) : members.length === 0 ? (
                  <p style={{ textAlign: "center", color: "#64748b", padding: 30 }}>
                    Chưa có thành viên nào
                  </p>
                ) : (
                  members.map((u) => (
                    <div
                      key={u.id}
                      style={{
                        padding: 16,
                        marginBottom: 12,
                        border: "1px solid #e5e7eb",
                        borderRadius: 18,
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 16,
                          color: "#0f172a",
                        }}
                      >
                        {u.username || "Chưa có username"}
                      </div>

                      <div
                        style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}
                      >
                        {u.email || "Không có email"}
                      </div>

                      <div
                        style={{ marginTop: 6, fontSize: 13, color: "#475569" }}
                      >
                        Vai trò hiện tại: <strong>{u.role || "user"}</strong>
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        {u.role !== "admin" && (
                          <>
                            <button
                              onClick={() => setModerator(u.id)}
                              style={{
                                padding: "10px 12px",
                                background: "#2563eb",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              Cấp Moderator
                            </button>

                            <button
                              onClick={() => removeModerator(u.id)}
                              style={{
                                padding: "10px 12px",
                                background: "#f59e0b",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              Hạ về User
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )
              ) : filteredMarkers.length === 0 ? (
                <p style={{ textAlign: "center", color: "#64748b", padding: 30 }}>
                  Không tìm thấy địa điểm nào
                </p>
              ) : (
                filteredMarkers.map((m) => {
                  const stats = markerStatsMap[m.id] || {
                    reviewCount: 0,
                    averageRating: 0,
                  };

                  return (
                    <div
                      key={m.id}
                      style={{
                        padding: 16,
                        marginBottom: 12,
                        border: "1px solid #e5e7eb",
                        borderRadius: 18,
                        background: selectedMarkerId === m.id ? "#eff6ff" : "#fff",
                        boxShadow:
                          selectedMarkerId === m.id
                            ? "0 6px 20px rgba(37,99,235,0.08)"
                            : "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <strong
                          style={{
                            color: "#0f172a",
                            fontSize: 16,
                            textAlign: "left",
                          }}
                        >
                          {m.name}
                        </strong>

                        <span style={{ fontSize: 22 }}>{getCategoryEmoji(m.category)}</span>
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: "#64748b",
                          textAlign: "left",
                        }}
                      >
                        {getCategoryLabel(m.category)}
                      </div>

                      <div
                        style={{
                          color: "#f59e0b",
                          fontSize: 18,
                          margin: "8px 0 0",
                          textAlign: "left",
                        }}
                      >
                        {renderStars(Math.round(stats.averageRating || 0))}
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 13,
                          color: "#64748b",
                          textAlign: "left",
                        }}
                      >
                        {(stats.averageRating || 0).toFixed(1)}/5 • {stats.reviewCount} đánh giá
                      </div>

                      {m.note && (
                        <p
                          style={{
                            color: "#475569",
                            marginTop: 8,
                            lineHeight: 1.5,
                            textAlign: "left",
                          }}
                        >
                          {m.note}
                        </p>
                      )}

                      {m.media?.length > 0 && (
                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            gap: 8,
                            overflowX: "auto",
                            paddingBottom: 4,
                          }}
                        >
                          {m.media.slice(0, 4).map((item) =>
                            item.type === "image" ? (
                              <img
                                key={item.id}
                                src={item.url}
                                alt="media"
                                style={{
                                  width: 62,
                                  height: 62,
                                  objectFit: "cover",
                                  borderRadius: 10,
                                  border: "1px solid #e5e7eb",
                                  flex: "0 0 auto",
                                }}
                              />
                            ) : (
                              <video
                                key={item.id}
                                src={item.url}
                                style={{
                                  width: 88,
                                  height: 62,
                                  objectFit: "cover",
                                  borderRadius: 10,
                                  border: "1px solid #e5e7eb",
                                  flex: "0 0 auto",
                                }}
                              />
                            )
                          )}
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: 14,
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          onClick={() => focusMarker(m)}
                          style={{
                            flex: 1,
                            padding: 10,
                            background: "#0ea5e9",
                            color: "#fff",
                            border: "none",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          Xem
                        </button>

                        <button
                          onClick={() => openReviewsViewer(m.id)}
                          style={{
                            flex: 1,
                            padding: 10,
                            background: "#f8fafc",
                            color: "#334155",
                            border: "1px solid #cbd5e1",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          Review
                        </button>

                        {canEditMap && (
                          <>
                            <button
                              onClick={() => startEdit(m)}
                              style={{
                                flex: 1,
                                padding: 10,
                                background: "#eab308",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              Sửa
                            </button>

                            <button
                              onClick={() => deleteMarker(m.id)}
                              style={{
                                flex: 1,
                                padding: 10,
                                background: "#fee2e2",
                                color: "#ef4444",
                                border: "none",
                                borderRadius: 10,
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              Xóa
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* Map */}
      <div style={{ position: "absolute", inset: 0 }}>
        <MapContainer
          className="utt-leaflet-map"
          center={defaultCenter}
          zoom={13}
          maxBounds={mapBounds}
          maxBoundsViscosity={1.0}
          style={{ width: "100%", height: "100%" }}
        >
          <MapController mapRef={mapRef} />
          <FixMapSize />

          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            tileSize={256}
            zoomOffset={0}
            updateWhenIdle
            keepBuffer={4}
          />

          <Circle
            center={defaultCenter}
            radius={radiusInMeters}
            pathOptions={{
              color: "#2563eb",
              fillColor: "#3b82f6",
              fillOpacity: 0.08,
            }}
          />

          <MapClickHandler onMapPointClick={handleMapPointClick} />
          <FlyToMarker target={selectedMarker} />

          {tempPoint && <Marker position={tempPoint} />}

          {tempPoint && showConfirm && (
            <Popup
              position={tempPoint}
              autoClose={false}
              closeOnClick={false}
              closeButton={false}
            >
              <div
                style={{ minWidth: 270, padding: 12 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
                  Thêm địa điểm mới?
                </div>

                <div style={{ marginBottom: 16 }}>
                  Tọa độ tạm: {placeDraft.lat}, {placeDraft.lng}
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={openCreateFormAtPoint}
                    style={{
                      flex: 1,
                      padding: 14,
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      borderRadius: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Đồng ý
                  </button>

                  <button
                    onClick={handleCancelAddLocation}
                    style={{
                      flex: 1,
                      padding: 14,
                      background: "#f1f5f9",
                      color: "#334155",
                      border: "2px solid #e2e8f0",
                      borderRadius: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Từ chối
                  </button>
                </div>
              </div>
            </Popup>
          )}

          {markers.map((m) => {
            const stats = markerStatsMap[m.id] || {
              reviewCount: 0,
              averageRating: 0,
            };

            return (
              <Marker
                key={m.id}
                position={[m.lat, m.lng]}
                icon={createPlaceIcon(m, selectedMarkerId === m.id)}
                eventHandlers={{
                  click: () => setSelectedMarkerId(m.id),
                }}
              >
                <Popup>
                  <PlacePopup
                    marker={m}
                    canEditMap={canEditMap}
                    isLoggedIn={isLoggedIn}
                    onEdit={startEdit}
                    onDelete={deleteMarker}
                    onOpenWriteReview={() => openWriteReview(m.id)}
                    onOpenReviews={() => openReviewsViewer(m.id)}
                    averageRating={stats.averageRating || 0}
                    reviewCount={stats.reviewCount || 0}
                  />
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Nút vị trí hiện tại - góc dưới phải */}
      <button
        className="utt-my-location-btn"
        onClick={goToMyLocation}
        style={{
          position: "absolute",
          bottom: 24,
          right: 24,
          zIndex: 2000,
          width: 58,
          height: 58,
          borderRadius: "50%",
          border: "none",
          background: "#ffffff",
          boxShadow: "0 14px 30px rgba(15,23,42,0.2)",
          fontSize: 24,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Vị trí của tôi"
      >
        📍
      </button>

      {/* Form thêm / sửa địa điểm */}
      {showPlaceForm && (
        <ModalShell onClose={resetPlaceDraft} maxWidth={1040}>
          <div className="utt-place-form-grid" style={{ minHeight: "min(88svh, 760px)" }}>
            <div
              style={{
                padding: "24px 22px 20px",
                overflowY: "auto",
                borderRight: "1px solid #e5e7eb",
              }}
            >
              <h2
                style={{
                  textAlign: "center",
                  margin: "0 0 18px",
                  fontSize: 30,
                  fontWeight: 800,
                  color: "#1e293b",
                }}
              >
                {isEditingPlace ? "Chỉnh sửa địa điểm" : "Thông tin địa điểm"}
              </h2>

              <div
                style={{
                  textAlign: "center",
                  marginBottom: 18,
                  color: "#64748b",
                  fontSize: 15,
                  lineHeight: 1.6,
                }}
              >
                Tọa độ hiện tại: {placeDraft.lat || "--"}, {placeDraft.lng || "--"}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 8,
                    color: "#1e293b",
                  }}
                >
                  Loại địa điểm
                </div>

                <select
                  value={placeDraft.category}
                  onChange={(e) =>
                    setPlaceDraft((prev) => ({
                      ...prev,
                      category: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: "1px solid #cbd5e1",
                    fontSize: 16,
                    outline: "none",
                  }}
                >
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 8,
                    color: "#1e293b",
                  }}
                >
                  Tên quán / địa điểm
                </div>

                <input
                  placeholder="Nhập tên quán hoặc địa điểm"
                  value={placeDraft.name}
                  onChange={(e) =>
                    setPlaceDraft((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: "1px solid #cbd5e1",
                    fontSize: 16,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 8,
                    color: "#1e293b",
                  }}
                >
                  Ghi chú
                </div>

                <textarea
                  placeholder="Mô tả thêm về địa điểm..."
                  value={placeDraft.note}
                  onChange={(e) =>
                    setPlaceDraft((prev) => ({
                      ...prev,
                      note: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    minHeight: 120,
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: "1px solid #cbd5e1",
                    fontSize: 16,
                    resize: "vertical",
                    outline: "none",
                  }}
                />
              </div>

              {canEditMap && (
                <>
                  <div
                    style={{
                      marginBottom: 18,
                      padding: 16,
                      borderRadius: 18,
                      background: "#f8fafc",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 17,
                        fontWeight: 800,
                        color: "#0f172a",
                        marginBottom: 12,
                      }}
                    >
                      Google Maps & tọa độ chính xác
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          marginBottom: 8,
                          color: "#1e293b",
                        }}
                      >
                        Link Google Maps
                      </div>

                      <input
                        placeholder="https://maps.google.com/..."
                        value={placeDraft.googleMapsLink}
                        onChange={(e) =>
                          setPlaceDraft((prev) => ({
                            ...prev,
                            googleMapsLink: e.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          padding: "14px 16px",
                          borderRadius: 14,
                          border: "1px solid #cbd5e1",
                          fontSize: 15,
                          outline: "none",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            marginBottom: 8,
                            color: "#1e293b",
                          }}
                        >
                          exactLat
                        </div>

                        <input
                          placeholder="Ví dụ: 21.292547"
                          value={placeDraft.exactLat}
                          onChange={(e) =>
                            setPlaceDraft((prev) => ({
                              ...prev,
                              exactLat: e.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            padding: "14px 16px",
                            borderRadius: 14,
                            border: "1px solid #cbd5e1",
                            fontSize: 15,
                            outline: "none",
                          }}
                        />
                      </div>

                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            marginBottom: 8,
                            color: "#1e293b",
                          }}
                        >
                          exactLng
                        </div>

                        <input
                          placeholder="Ví dụ: 105.584216"
                          value={placeDraft.exactLng}
                          onChange={(e) =>
                            setPlaceDraft((prev) => ({
                              ...prev,
                              exactLng: e.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            padding: "14px 16px",
                            borderRadius: 14,
                            border: "1px solid #cbd5e1",
                            fontSize: 15,
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 13,
                        color: "#64748b",
                        lineHeight: 1.6,
                      }}
                    >
                      Nếu nhập <strong>exactLat</strong> và <strong>exactLng</strong>{" "}
                      hợp lệ, marker sẽ tự dùng tọa độ chính xác đó thay cho tọa độ click
                      ban đầu.
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button
                  onClick={saveMarker}
                  style={{
                    flex: 1,
                    padding: "15px",
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: "pointer",
                  }}
                >
                  {isEditingPlace ? "Cập nhật địa điểm" : "Lưu địa điểm"}
                </button>

                <button
                  onClick={resetPlaceDraft}
                  style={{
                    flex: 1,
                    padding: "15px",
                    background: "#fff",
                    color: "#334155",
                    border: "2px solid #e2e8f0",
                    borderRadius: 12,
                    fontWeight: 600,
                    fontSize: 16,
                    cursor: "pointer",
                  }}
                >
                  Hủy
                </button>
              </div>
            </div>

            <div
              style={{
                padding: "24px 20px 20px",
                overflowY: "auto",
                background: "#f8fafc",
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: "#1e293b",
                  marginBottom: 14,
                }}
              >
                Ảnh / video địa điểm
              </div>

              <div
                style={{
                  fontSize: 14,
                  color: "#64748b",
                  lineHeight: 1.6,
                  marginBottom: 16,
                }}
              >
                Bạn có thể thêm nhiều ảnh hoặc video để minh họa cho địa điểm này.
              </div>

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  background: "#e2fbe8",
                  padding: "10px 16px",
                  borderRadius: 12,
                  cursor: "pointer",
                  flexWrap: "wrap",
                  marginBottom: 16,
                }}
              >
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  ref={placeMediaInputRef}
                  onChange={handlePlaceMediaUpload}
                  style={{ display: "none" }}
                />

                <span
                  style={{
                    background: "#16a34a",
                    color: "#fff",
                    padding: "8px 16px",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  Chọn media
                </span>

                <span style={{ color: "#475569", fontSize: 14 }}>
                  {placeDraft.media?.length
                    ? `${placeDraft.media.length} media đã chọn`
                    : "Chưa có media"}
                </span>
              </label>

              {placeDraft.media?.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: 12,
                  }}
                >
                  {placeDraft.media.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 16,
                        padding: 8,
                        boxShadow: "0 6px 18px rgba(15,23,42,0.06)",
                      }}
                    >
                      <MediaPreviewItem item={item} onRemove={removePlaceDraftMedia} />
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    border: "2px dashed #cbd5e1",
                    borderRadius: 18,
                    padding: "28px 18px",
                    background: "#fff",
                    textAlign: "center",
                    color: "#64748b",
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🖼️</div>
                  <div
                    style={{
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: 6,
                    }}
                  >
                    Chưa có media nào
                  </div>
                  <div style={{ fontSize: 14 }}>
                    Hãy thêm ảnh hoặc video để địa điểm sinh động hơn.
                  </div>
                </div>
              )}
            </div>
          </div>
        </ModalShell>
      )}

      {/* Modal viết review */}
      {showReviewEditor && activeReviewMarker && (
        <ReviewEditorModal
          marker={activeReviewMarker}
          reviewDraft={reviewDraft}
          setReviewDraft={setReviewDraft}
          onClose={() => {
            setShowReviewEditor(false);
            resetReviewDraft();
          }}
          onSubmit={submitReview}
          reviewSaving={reviewSaving}
          reviewMediaInputRef={reviewMediaInputRef}
          onUploadReviewMedia={handleReviewMediaUpload}
          onRemoveReviewMedia={removeReviewDraftMedia}
          isEditingReview={!!getMyReviewForMarker(activeReviewMarker.id)}
        />
      )}

      {/* Modal xem review */}
      {showReviewsViewer && activeReviewMarker && (
        <ReviewsViewerModal
          marker={activeReviewMarker}
          reviews={activeReviews}
          averageRating={activeStats.averageRating || 0}
          onClose={() => setShowReviewsViewer(false)}
          onWriteReview={() => {
            setShowReviewsViewer(false);
            openWriteReview(activeReviewMarker.id);
          }}
          isLoggedIn={isLoggedIn}
          myReview={myActiveReview}
        />
      )}

      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <UsernameModal />

      {/* Toast */}
      {message && (
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: 24,
            background: "#1e2937",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 9999,
            fontSize: 14.5,
            boxShadow: "0 8px 25px rgba(0,0,0,0.25)",
            zIndex: 3000,
            maxWidth: "min(90vw, 420px)",
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}