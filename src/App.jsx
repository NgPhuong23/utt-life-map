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

// Fix icon mặc định của Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const defaultCenter = [21.29254772834021, 105.58421695202658];
const radiusInMeters = 6000;

const mapBounds = [
  [21.2325, 105.5242],
  [21.3525, 105.6442],
];

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

function createPlaceIcon(place) {
  const safeName = (place.name || "Địa điểm")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const logoHtml = place.logo
    ? `<img src="${place.logo}" style="width:46px;height:46px;border-radius:999px;object-fit:cover;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.25);background:#fff;" />`
    : `<div style="width:46px;height:46px;border-radius:999px;background:#2563eb;color:white;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.25);">
         ${safeName.charAt(0).toUpperCase()}
       </div>`;

  return L.divIcon({
    className: "",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-8px);">
        ${logoHtml}
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
          max-width:150px;
          overflow:hidden;
          text-overflow:ellipsis;
          border:1px solid #e5e7eb;
        ">
          ${safeName}
        </div>
      </div>
    `,
    iconSize: [150, 74],
    iconAnchor: [23, 58],
    popupAnchor: [0, -52],
  });
}

function StarRatingInput({ value, onChange }) {
  const [hoverValue, setHoverValue] = useState(0);

  return (
    <div style={{ marginBottom: 14, textAlign: "center" }}>
      <div
        style={{
          marginBottom: 8,
          fontWeight: 700,
          color: "#334155",
          fontSize: 18,
        }}
      >
        Đánh giá
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
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
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: 0,
                lineHeight: 1,
                fontSize: 32,
              }}
              title={`${star} sao`}
            >
              <span style={{ color: active ? "#f59e0b" : "#d1d5db" }}>★</span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          fontSize: 14,
          color: "#64748b",
          fontWeight: 500,
        }}
      >
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
    if (!target) return;
    map.flyTo([target.lat, target.lng], 16, { duration: 1.2 });
  }, [target, map]);

  return null;
}

export default function App() {
  const [markers, setMarkers] = useState(() => {
    const saved = localStorage.getItem("utt_life_map_markers");
    return saved ? JSON.parse(saved) : [];
  });

  const [draft, setDraft] = useState({
    name: "",
    note: "",
    lat: "",
    lng: "",
    rating: 0,
    logo: "",
  });

  const [message, setMessage] = useState(
    "Nhấn vào một vị trí trên bản đồ để thêm địa điểm."
  );
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [tempPoint, setTempPoint] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const logoInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("utt_life_map_markers", JSON.stringify(markers));
  }, [markers]);

  const selectedMarker = useMemo(
    () => markers.find((m) => m.id === selectedMarkerId) || null,
    [markers, selectedMarkerId]
  );

  const resetDraft = () => {
    setDraft({
      name: "",
      note: "",
      lat: "",
      lng: "",
      rating: 0,
      logo: "",
    });
    setTempPoint(null);
    setShowConfirm(false);
    setShowForm(false);
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  };

  const handleMapPointClick = (lat, lng) => {
    const distance = getDistanceInMeters(
      defaultCenter[0],
      defaultCenter[1],
      lat,
      lng
    );

    if (distance > radiusInMeters) {
      setMessage("Bạn chỉ được đánh dấu địa điểm trong bán kính 6km.");
      return;
    }

    setDraft((prev) => ({
      ...prev,
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
    }));
    setTempPoint([lat, lng]);
    setShowConfirm(true);
    setShowForm(false);
    setMessage("Bạn đã chọn một vị trí mới.");
  };

  const handleAgreeAddLocation = () => {
    setShowConfirm(false);
    setShowForm(true);
    setMessage("Hãy nhập thông tin địa điểm.");
  };

  const handleCancelAddLocation = () => {
    setShowConfirm(false);
    setShowForm(false);
    setTempPoint(null);
    setDraft((prev) => ({
      ...prev,
      lat: "",
      lng: "",
    }));
    setMessage("Đã hủy thêm địa điểm.");
  };

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Vui lòng chọn file ảnh làm logo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDraft((prev) => ({
        ...prev,
        logo: String(reader.result),
      }));
      setMessage("Đã thêm logo cho địa điểm.");
    };
    reader.readAsDataURL(file);
  };

  const addMarker = () => {
    if (!draft.name || !draft.lat || !draft.lng) {
      setMessage("Vui lòng chọn vị trí và nhập tên địa điểm.");
      return;
    }

    const lat = Number(draft.lat);
    const lng = Number(draft.lng);

    const distance = getDistanceInMeters(
      defaultCenter[0],
      defaultCenter[1],
      lat,
      lng
    );

    if (distance > radiusInMeters) {
      setMessage("Không thể thêm địa điểm ngoài bán kính 6km.");
      return;
    }

    const newMarker = {
      id: Date.now(),
      name: draft.name.trim(),
      note: draft.note.trim(),
      lat,
      lng,
      rating: Number(draft.rating) || 0,
      logo: draft.logo || "",
      createdAt: new Date().toISOString(),
    };

    setMarkers((prev) => [newMarker, ...prev]);
    setSelectedMarkerId(newMarker.id);
    resetDraft();
    setMessage("Đã thêm địa điểm thành công.");
  };

  const deleteMarker = (id) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
    if (selectedMarkerId === id) {
      setSelectedMarkerId(null);
    }
    setMessage("Đã xóa địa điểm.");
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        position: "relative",
        background: "#f8fafc",
      }}
    >
      <button
        onClick={() => setShowMenu((prev) => !prev)}
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 1200,
          width: 52,
          height: 52,
          borderRadius: 14,
          border: "none",
          background: "#ffffff",
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
          fontWeight: 700,
          color: "#1e293b",
        }}
        title="Mở menu"
      >
        ☰
      </button>

      {showMenu && (
        <>
          <div
            onClick={() => setShowMenu(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15,23,42,0.25)",
              zIndex: 1100,
            }}
          />

          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 360,
              height: "100%",
              background: "#ffffff",
              zIndex: 1300,
              boxShadow: "12px 0 30px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: "#1e293b",
                    marginBottom: 4,
                  }}
                >
                  Menu
                </div>
                <div style={{ color: "#64748b", fontSize: 14 }}>
                  Danh sách các mục
                </div>
              </div>

              <button
                onClick={() => setShowMenu(false)}
                style={{
                  border: "none",
                  background: "#f1f5f9",
                  borderRadius: 10,
                  width: 38,
                  height: 38,
                  cursor: "pointer",
                  fontSize: 20,
                  color: "#334155",
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                padding: 16,
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontWeight: 700,
                  border: "1px solid #bfdbfe",
                }}
              >
                Danh sách địa điểm
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: 16,
              }}
            >
              {markers.length === 0 && (
                <p style={{ color: "#64748b" }}>Chưa có địa điểm nào.</p>
              )}

              {markers.map((m) => (
                <div
                  key={m.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: 14,
                    marginBottom: 12,
                    borderRadius: 18,
                    background: selectedMarkerId === m.id ? "#eff6ff" : "#ffffff",
                    boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
                  }}
                >
                  <strong style={{ color: "#0f172a", fontSize: 17 }}>{m.name}</strong>

                  {m.logo ? (
                    <div style={{ marginTop: 8 }}>
                      <img
                        src={m.logo}
                        alt={m.name}
                        style={{
                          width: 64,
                          height: 64,
                          objectFit: "cover",
                          borderRadius: 14,
                          border: "1px solid #ddd",
                        }}
                      />
                    </div>
                  ) : null}

                  <div style={{ marginTop: 8, color: "#f59e0b", fontSize: 18 }}>
                    {m.rating ? (
                      renderStars(m.rating)
                    ) : (
                      <span style={{ color: "#888", fontSize: 14 }}>
                        Chưa đánh giá
                      </span>
                    )}
                  </div>

                  {m.rating ? (
                    <div style={{ color: "#666", fontSize: 14, marginTop: 4 }}>
                      {m.rating}/5 - {getRatingLabel(m.rating)}
                    </div>
                  ) : null}

                  <p style={{ marginBottom: 6, color: "#475569", lineHeight: 1.6 }}>
                    {m.note}
                  </p>

                  <small style={{ color: "#64748b" }}>
                    {m.lat}, {m.lng}
                  </small>

                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button
                      onClick={() => {
                        setSelectedMarkerId(m.id);
                        setShowMenu(false);
                      }}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderRadius: 10,
                        border: "none",
                        background: "#0ea5e9",
                        color: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      Xem
                    </button>

                    <button
                      onClick={() => deleteMarker(m.id)}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderRadius: 10,
                        border: "1px solid #fecaca",
                        background: "#fff1f2",
                        color: "#be123c",
                        fontWeight: 700,
                      }}
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div
        style={{
          position: "absolute",
          top: 16,
          left: 84,
          zIndex: 1000,
          background: "rgba(255,255,255,0.96)",
          padding: "12px 16px",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
          maxWidth: 360,
          border: "1px solid #e5e7eb",
        }}
      >
        <h1
          style={{
            margin: 0,
            marginBottom: 6,
            fontSize: 34,
            fontWeight: 800,
            color: "#1e293b",
            letterSpacing: "-1px",
          }}
        >
          UTT Life Map
        </h1>

        <div style={{ color: "#475569", fontSize: 15, lineHeight: 1.5 }}>
          {message}
        </div>

        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            color: "#475569",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "#334155" }}>Tâm bản đồ:</strong>
          <br />
          {defaultCenter[0]}, {defaultCenter[1]}
          <br />
          <strong style={{ color: "#334155" }}>Bán kính:</strong> 6km
        </div>
      </div>

      {showConfirm && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#fff",
              borderRadius: 20,
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
              padding: 24,
            }}
          >
            <h2 style={{ marginTop: 0, color: "#0f172a" }}>Thêm địa điểm mới</h2>
            <p style={{ color: "#475569", lineHeight: 1.6 }}>
              Bạn đã chọn một vị trí trên bản đồ.
              <br />
              Bạn có muốn thêm địa điểm tại vị trí này không?
            </p>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 12,
                color: "#475569",
                marginBottom: 16,
              }}
            >
              <strong>Tọa độ:</strong>
              <br />
              {draft.lat}, {draft.lng}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleAgreeAddLocation}
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Đồng ý
              </button>

              <button
                onClick={handleCancelAddLocation}
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#334155",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            zIndex: 2100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "90vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 20,
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
              padding: 24,
            }}
          >
            <h2 style={{ marginTop: 0, color: "#0f172a" }}>Thông tin địa điểm</h2>

            <input
              placeholder="Tên quán / địa điểm"
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              style={{
                width: "100%",
                padding: 14,
                marginBottom: 10,
                boxSizing: "border-box",
                borderRadius: 14,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontSize: 15,
                outline: "none",
              }}
            />

            <textarea
              placeholder="Ghi chú"
              value={draft.note}
              onChange={(e) => setDraft((prev) => ({ ...prev, note: e.target.value }))}
              style={{
                width: "100%",
                padding: 14,
                marginBottom: 10,
                minHeight: 100,
                boxSizing: "border-box",
                borderRadius: 14,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontSize: 15,
                outline: "none",
              }}
            />

            <StarRatingInput
              value={draft.rating}
              onChange={(rating) => setDraft((prev) => ({ ...prev, rating }))}
            />

            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  marginBottom: 8,
                  fontWeight: 700,
                  color: "#334155",
                  fontSize: 18,
                  textAlign: "center",
                }}
              >
                Logo địa điểm
              </div>
              <div style={{ textAlign: "center" }}>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                />
              </div>
            </div>

            {draft.logo ? (
              <div style={{ marginBottom: 12, textAlign: "center" }}>
                <img
                  src={draft.logo}
                  alt="Logo xem trước"
                  style={{
                    width: 90,
                    height: 90,
                    objectFit: "cover",
                    borderRadius: 16,
                    border: "1px solid #ddd",
                    boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                  }}
                />
              </div>
            ) : null}

            <input
              placeholder="Vĩ độ"
              value={draft.lat}
              readOnly
              style={{
                width: "100%",
                padding: 14,
                marginBottom: 10,
                background: "#ffffff",
                color: "#000000",
                WebkitTextFillColor: "#000000",
                opacity: 1,
                boxSizing: "border-box",
                borderRadius: 14,
                border: "1px solid #cbd5e1",
                fontSize: 16,
                fontWeight: 600,
              }}
            />

            <input
              placeholder="Kinh độ"
              value={draft.lng}
              readOnly
              style={{
                width: "100%",
                padding: 14,
                marginBottom: 14,
                background: "#ffffff",
                color: "#000000",
                WebkitTextFillColor: "#000000",
                opacity: 1,
                boxSizing: "border-box",
                borderRadius: 14,
                border: "1px solid #cbd5e1",
                fontSize: 16,
                fontWeight: 600,
              }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={addMarker}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  borderRadius: 12,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                Lưu địa điểm
              </button>

              <button
                onClick={resetDraft}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                  fontWeight: 600,
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: "100%", width: "100%" }}>
        <MapContainer
          center={defaultCenter}
          zoom={13}
          maxBounds={mapBounds}
          maxBoundsViscosity={1.0}
          style={{
            height: "100%",
            width: "100%",
          }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Circle
            center={defaultCenter}
            radius={radiusInMeters}
            pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.08 }}
          />

          <MapClickHandler onMapPointClick={handleMapPointClick} />

          <FlyToMarker target={selectedMarker} />

          {tempPoint ? (
            <Marker position={tempPoint}>
              <Popup>Vị trí đang chọn</Popup>
            </Marker>
          ) : null}

          {markers.map((m) => (
            <Marker key={m.id} position={[m.lat, m.lng]} icon={createPlaceIcon(m)}>
              <Popup>
                <div style={{ width: 220 }}>
                  <strong>{m.name}</strong>
                  <br />

                  {m.logo ? (
                    <img
                      src={m.logo}
                      alt={m.name}
                      style={{
                        width: 72,
                        height: 72,
                        objectFit: "cover",
                        borderRadius: 14,
                        margin: "8px 0",
                        border: "1px solid #ddd",
                      }}
                    />
                  ) : null}

                  <div style={{ color: "#f59e0b", margin: "6px 0", fontSize: 18 }}>
                    {m.rating ? (
                      renderStars(m.rating)
                    ) : (
                      <span style={{ color: "#888", fontSize: 14 }}>Chưa đánh giá</span>
                    )}
                  </div>

                  {m.rating ? (
                    <div style={{ color: "#666", fontSize: 14, marginBottom: 8 }}>
                      {m.rating}/5 - {getRatingLabel(m.rating)}
                    </div>
                  ) : null}

                  <div>{m.note}</div>
                  <small>
                    {m.lat}, {m.lng}
                  </small>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}