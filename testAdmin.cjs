const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function test() {
  const app = admin.app();
  console.log("✅ App initialized:", app.name);

  const list = await admin.auth().listUsers(1);
  console.log("✅ Auth OK. First page size:", list.users.length);

  const doc = await admin.firestore().collection("users").limit(1).get();
  console.log("✅ Firestore OK. Docs found:", doc.size);
}

test()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Admin test failed:", err);
    process.exit(1);
  });