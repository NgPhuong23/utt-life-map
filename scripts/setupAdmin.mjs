import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(
  fs.readFileSync("./serviceAccountKey.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const ADMIN_EMAIL = "uttmapvifu@vifu.com";
const ADMIN_PASSWORD = "uttvifu@123";

async function main() {
  let userRecord;

  try {
    userRecord = await admin.auth().getUserByEmail(ADMIN_EMAIL);
  } catch {
    userRecord = await admin.auth().createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      emailVerified: true,
    });
  }

  await admin.auth().setCustomUserClaims(userRecord.uid, {
    role: "admin",
  });

  await db.collection("users").doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      email: ADMIN_EMAIL,
      username: "UTTAdmin",
      usernameLower: "uttadmin",
      role: "admin",
      favorites: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Đã tạo/cập nhật admin:", userRecord.uid);
}

main().catch(console.error);