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
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { useAuthCtx } from "./context/AuthContext";
import AuthModal from "./components/AuthModal";
import UsernameModal from "./components/UsernameModal";

// Fix icon Leaflet mặc định
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

const emptyDraft = {
  id: null,
  name: "",
  note: "",
  lat: "",
  lng: "",
  rating: 0,
  category: "cafe",
  media: [],
};

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

function formatDateTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("vi-VN");
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
  return "★".repeat(value) + "☆".repeat(5 - value);
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

function StarRatingInput({ value, onChange }) {
  const [hoverValue, setHoverValue] = useState(0);

  return (
    <div style={{ textAlign: "center", margin: "18px 0 20px" }}>
      <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
        Đánh giá
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
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
                fontSize: 34,
                cursor: "pointer",
                color: active ? "#f59e0b" : "#d1d5db",
                lineHeight: 1,
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
    if (target) {
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

function MediaPreviewItem({ item, onRemove }) {
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

      <button
        type="button"
        onClick={() => onRemove(item.id)}
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
    </div>
  );
}

function PlacePopup({ marker, onEdit, onDelete, canEditMap }) {
  return (
    <div style={{ width: 280, color: "#0f172a" }}>
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

          <div
            style={{
              marginTop: 4,
              fontSize: 13,
              color: "#475569",
            }}
          >
            {getCategoryLabel(marker.category)}
          </div>

          {marker.rating > 0 && (
            <div style={{ marginTop: 6, color: "#f59e0b", fontSize: 18 }}>
              {renderStars(marker.rating)}
            </div>
          )}
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
          lineHeight: 1.5,
        }}
      >
        <div>
          Tọa độ: {Number(marker.lat).toFixed(6)},{" "}
          {Number(marker.lng).toFixed(6)}
        </div>
        <div>Thêm lúc: {formatDateTime(marker.createdAt)}</div>
        {marker.createdByName && <div>Người thêm: {marker.createdByName}</div>}
      </div>

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

  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState("");
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [tempPoint, setTempPoint] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const mediaInputRef = useRef(null);
  const mapRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  const showMessage = (text) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setMessage(text);
    toastTimeoutRef.current = setTimeout(() => setMessage(""), 2400);
  };

  useEffect(() => {
    document.title = "UTT Life Map";
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAdmin && activeTab === "members") {
      setActiveTab("places");
    }
  }, [isAdmin, activeTab]);

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

  useEffect(() => {
    const q = query(collection(db, "markers"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((item) => {
            const data = item.data();

            return {
              id: item.id,
              name: typeof data.name === "string" ? data.name : "Địa điểm",
              note: typeof data.note === "string" ? data.note : "",
              lat: Number(data.lat),
              lng: Number(data.lng),
              rating: Number(data.rating) || 0,
              category:
                typeof data.category === "string" ? data.category : "khac",
              media: Array.isArray(data.media) ? data.media : [],
              createdAt: data.createdAt?.toDate
                ? data.createdAt.toDate().toISOString()
                : data.createdAt || new Date().toISOString(),
              createdBy: data.createdBy || null,
              createdByName: data.createdByName || "",
            };
          })
          .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));

        setMarkers(list);
      },
      (error) => {
        console.error("Markers snapshot error:", error);
        showMessage("❌ Không tải được dữ liệu địa điểm");
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-utt-leaflet-fix", "true");
    styleEl.textContent = `
      .utt-map-scope,
      .utt-map-scope * {
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

      @media (max-width: 860px) {
        .utt-map-scope .utt-place-form-grid {
          grid-template-columns: 1fr !important;
        }
      }
    `;
    document.head.appendChild(styleEl);

    return () => {
      styleEl.remove();
    };
  }, []);

  const selectedMarker = useMemo(
    () => markers.find((m) => m.id === selectedMarkerId) || null,
    [markers, selectedMarkerId]
  );

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
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    } else {
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return list;
  }, [markers, searchTerm, categoryFilter, sortBy]);

  const totalStats = useMemo(() => {
    const ratedCount = markers.filter((m) => m.rating > 0).length;
    const avgRating =
      ratedCount > 0
        ? (
            markers.reduce((sum, m) => sum + (m.rating || 0), 0) / ratedCount
          ).toFixed(1)
        : "0.0";

    return {
      total: markers.length,
      ratedCount,
      avgRating,
    };
  }, [markers]);

  const requireEditPermission = () => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      showMessage("❌ Hãy đăng nhập để tiếp tục");
      return false;
    }

    if (!canEditMap) {
      showMessage("❌ Bạn không có quyền thêm, sửa hoặc xóa địa điểm");
      return false;
    }

    return true;
  };

  const resetDraft = () => {
    setDraft(emptyDraft);
    setTempPoint(null);
    setShowConfirm(false);
    setShowForm(false);
    setIsEditing(false);

    if (mediaInputRef.current) {
      mediaInputRef.current.value = "";
    }
  };

  const openCreateFormAtPoint = () => {
    if (!requireEditPermission()) return;
    setShowConfirm(false);
    setShowForm(true);
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

    setDraft((prev) => ({
      ...prev,
      id: null,
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
    }));
    setTempPoint([lat, lng]);
    setIsEditing(false);
    setShowConfirm(true);
  };

  const handleCancelAddLocation = () => {
    setShowConfirm(false);
    setTempPoint(null);
    setDraft((prev) => ({ ...prev, lat: "", lng: "" }));
    showMessage("Đã hủy");
  };

  const handleMediaUpload = (e) => {
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

    Promise.all(
      validFiles.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: Date.now() + Math.random(),
                type: file.type.startsWith("image/") ? "image" : "video",
                url: String(reader.result || ""),
              });
            reader.readAsDataURL(file);
          })
      )
    ).then((uploadedMedia) => {
      setDraft((prev) => ({
        ...prev,
        media: [...(prev.media || []), ...uploadedMedia],
      }));

      if (mediaInputRef.current) {
        mediaInputRef.current.value = "";
      }

      showMessage(`✅ Đã thêm ${uploadedMedia.length} media`);
    });
  };

  const removeDraftMedia = (mediaId) => {
    setDraft((prev) => ({
      ...prev,
      media: (prev.media || []).filter((item) => item.id !== mediaId),
    }));
  };

  const saveMarker = async () => {
    if (!requireEditPermission()) return;

    if (!draft.name.trim()) {
      showMessage("❌ Vui lòng nhập tên địa điểm");
      return;
    }

    const lat = Number(draft.lat);
    const lng = Number(draft.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      showMessage("❌ Tọa độ không hợp lệ");
      return;
    }

    if (
      getDistanceInMeters(defaultCenter[0], defaultCenter[1], lat, lng) >
      radiusInMeters
    ) {
      showMessage("❌ Vị trí ngoài bán kính cho phép");
      return;
    }

    try {
      if (isEditing) {
        await updateDoc(doc(db, "markers", String(draft.id)), {
          name: draft.name.trim(),
          note: draft.note.trim(),
          lat,
          lng,
          rating: draft.rating,
          category: draft.category,
          media: draft.media || [],
        });

        setSelectedMarkerId(draft.id);
        showMessage("✅ Đã cập nhật địa điểm");
      } else {
        const docRef = await addDoc(collection(db, "markers"), {
          name: draft.name.trim(),
          note: draft.note.trim(),
          lat,
          lng,
          rating: draft.rating,
          category: draft.category,
          media: draft.media || [],
          createdAt: serverTimestamp(),
          createdBy: firebaseUser?.uid || null,
          createdByName: profile?.username || firebaseUser?.email || "Ẩn danh",
        });

        setSelectedMarkerId(docRef.id);
        showMessage("✅ Đã thêm địa điểm thành công");
      }

      resetDraft();
    } catch (error) {
      console.error("Save marker error:", error);
      showMessage("❌ Không lưu được địa điểm");
    }
  };

  const startEdit = (marker) => {
    if (!requireEditPermission()) return;

    setDraft({
      id: marker.id,
      name: marker.name || "",
      note: marker.note || "",
      lat: String(marker.lat ?? ""),
      lng: String(marker.lng ?? ""),
      rating: marker.rating || 0,
      category: marker.category || "khac",
      media: marker.media || [],
    });

    setTempPoint([marker.lat, marker.lng]);
    setIsEditing(true);
    setShowForm(true);
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
      await deleteDoc(doc(db, "markers", String(id)));

      if (selectedMarkerId === id) {
        setSelectedMarkerId(null);
      }

      showMessage("🗑️ Đã xóa địa điểm");
    } catch (error) {
      console.error("Delete marker error:", error);
      showMessage("❌ Xóa địa điểm thất bại");
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
      await updateDoc(doc(db, "users", userId), {
        role: "moderator",
      });
      showMessage("✅ Đã chuyển thành Co-Admin");
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
      await updateDoc(doc(db, "users", userId), {
        role: "user",
      });
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

      <button
        onClick={goToMyLocation}
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
        title="Vị trí của tôi"
      >
        📍
      </button>

      {!isLoggedIn ? (
        <button
          onClick={() => setShowAuthModal(true)}
          style={{
            position: "absolute",
            top: 16,
            left: 144,
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
      ) : (
        <button
          onClick={logout}
          style={{
            position: "absolute",
            top: 16,
            left: 144,
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
          title="Đăng xuất"
        >
          ↩
        </button>
      )}

      <div
        style={{
          position: "absolute",
          top: 16,
          left: 210,
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
          <span>📝 {totalStats.ratedCount} địa điểm đã đánh giá</span>
          <span>
            👤 {isLoggedIn ? profile?.username || firebaseUser?.email : "Khách"}
          </span>
          <span>🛡️ {isLoggedIn ? role : "guest"}</span>
        </div>
      </div>

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
                    border:
                      activeTab === "places" ? "none" : "1px solid #cbd5e1",
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
                      border:
                        activeTab === "members" ? "none" : "1px solid #cbd5e1",
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
                      <option value="rating">Rating cao nhất</option>
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
                      <strong>{canEditMap ? "Admin / Co-Admin" : "User"}</strong>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              {activeTab === "members" ? (
                !isAdmin ? (
                  <p
                    style={{
                      textAlign: "center",
                      color: "#64748b",
                      padding: 30,
                    }}
                  >
                    Bạn không có quyền truy cập mục này
                  </p>
                ) : members.length === 0 ? (
                  <p
                    style={{
                      textAlign: "center",
                      color: "#64748b",
                      padding: 30,
                    }}
                  >
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
                              Cấp Co-Admin
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

                        <button
                          onClick={() => setActiveTab("places")}
                          style={{
                            padding: "10px 12px",
                            background: "#e2e8f0",
                            color: "#334155",
                            border: "none",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          Quay lại
                        </button>
                      </div>
                    </div>
                  ))
                )
              ) : filteredMarkers.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    color: "#64748b",
                    padding: 30,
                  }}
                >
                  Không tìm thấy địa điểm nào
                </p>
              ) : (
                filteredMarkers.map((m) => (
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

                      <span style={{ fontSize: 22 }}>
                        {getCategoryEmoji(m.category)}
                      </span>
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

                    {m.rating > 0 && (
                      <div
                        style={{
                          color: "#f59e0b",
                          fontSize: 18,
                          margin: "8px 0",
                          textAlign: "left",
                        }}
                      >
                        {renderStars(m.rating)}
                      </div>
                    )}

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

                      {canEditMap && (
                        <>
                          <button
                            onClick={() => startEdit(m)}
                            style={{
                              flex: 1,
                              padding: 10,
                              background: "#22c55e",
                              color: "#fff",
                              border: "none",
                              borderRadius: 10,
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            📸 Thêm media
                          </button>

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
                ))
              )}
            </div>
          </div>
        </>
      )}

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
                  Tọa độ: {draft.lat}, {draft.lng}
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

          {displayMarkers.map((m) => (
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
                  onEdit={startEdit}
                  onDelete={deleteMarker}
                  canEditMap={canEditMap}
                />
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {showForm && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            zIndex: 2500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            className="utt-place-form-grid"
            style={{
              width: "100%",
              maxWidth: 980,
              height: "min(88svh, 760px)",
              background: "#ffffff",
              borderRadius: 28,
              border: "3px solid #22c55e",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <button
              onClick={resetDraft}
              style={{
                position: "absolute",
                top: 14,
                right: 18,
                fontSize: 26,
                background: "none",
                border: "none",
                cursor: "pointer",
                zIndex: 2,
              }}
            >
              ×
            </button>

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
                {isEditing ? "Chỉnh sửa địa điểm" : "Thông tin địa điểm"}
              </h2>

              <div
                style={{
                  textAlign: "center",
                  marginBottom: 18,
                  color: "#64748b",
                  fontSize: 16,
                }}
              >
                Tọa độ: {draft.lat || "--"}, {draft.lng || "--"}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 8,
                    color: "#1e293b",
                    background: "#fff",
                    border: "2px solid #22c55e",
                    borderRadius: 10,
                    padding: "6px 14px",
                    display: "inline-block",
                  }}
                >
                  Loại địa điểm:
                </div>

                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft((prev) => ({
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
                    background: "#fff",
                    border: "2px solid #22c55e",
                    borderRadius: 10,
                    padding: "6px 14px",
                    display: "inline-block",
                  }}
                >
                  Tên quán / địa điểm:
                </div>

                <input
                  placeholder="Nhập tên quán hoặc địa điểm"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((prev) => ({
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
                  }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 8,
                    color: "#1e293b",
                    background: "#fff",
                    border: "2px solid #22c55e",
                    borderRadius: 10,
                    padding: "6px 14px",
                    display: "inline-block",
                  }}
                >
                  Ghi chú:
                </div>

                <textarea
                  placeholder="Mô tả thêm về địa điểm..."
                  value={draft.note}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      note: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    minHeight: 130,
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: "1px solid #cbd5e1",
                    fontSize: 16,
                    resize: "vertical",
                  }}
                />
              </div>

              <StarRatingInput
                value={draft.rating}
                onChange={(rating) =>
                  setDraft((prev) => ({
                    ...prev,
                    rating,
                  }))
                }
              />

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
                  {isEditing ? "Cập nhật địa điểm" : "Lưu địa điểm"}
                </button>

                <button
                  onClick={resetDraft}
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
                Bạn có thể thêm nhiều ảnh hoặc video để minh họa cho địa điểm
                này.
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
                  ref={mediaInputRef}
                  onChange={handleMediaUpload}
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
                  {draft.media?.length
                    ? `${draft.media.length} media đã chọn`
                    : "Chưa có media"}
                </span>
              </label>

              {draft.media?.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: 12,
                  }}
                >
                  {draft.media.map((item) => (
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
                      <MediaPreviewItem item={item} onRemove={removeDraftMedia} />
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
                    Hãy thêm ảnh hoặc video ở cột bên phải để địa điểm sinh động
                    hơn.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      <UsernameModal />

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
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}