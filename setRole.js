const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// 👉 DÁN UID VÀO ĐÂY
const uid = "DAN_UID_VAO_DAY";
const role = "admin"; // admin | moderator | user

admin
  .auth()
  .setCustomUserClaims(uid, { role })
  .then(() => {
    console.log("✅ Set role thành công:", role);
    console.log("⚠️ Logout rồi login lại nhé");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Lỗi:", err);
    process.exit(1);
  });