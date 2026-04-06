const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function syncRolesToCustomClaims() {
  const snapshot = await db.collection("users").get();

  if (snapshot.empty) {
    console.log("Không có user nào trong collection users");
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const docSnap of snapshot.docs) {
    const uid = docSnap.id;
    const data = docSnap.data() || {};
    const role = ["admin", "moderator", "user"].includes(data.role)
      ? data.role
      : "user";

    try {
      await admin.auth().setCustomUserClaims(uid, { role });
      console.log(`✅ ${uid} => role: ${role}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Lỗi set role cho ${uid}:`, error.message);
      failCount++;
    }
  }

  console.log("----- DONE -----");
  console.log("Thành công:", successCount);
  console.log("Thất bại:", failCount);
  console.log("⚠️ Tất cả user cần logout/login lại để nhận role mới.");
}

syncRolesToCustomClaims()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Lỗi tổng:", error);
    process.exit(1);
  });