const firebase = require("firebase/app");
require("firebase/firestore");

const firebaseConfig = {
    apiKey: "AIzaSyB5khMxwG1MfG8mJBg3hZYo5nBfbWBR9hE",
    authDomain: "almez0-servers.firebaseapp.com",
    projectId: "almez0-servers"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

async function run() {
    console.log("Fetching products...");
    const snapshot = await db.collection("products").get();
    const batch = db.batch();
    let i = 1;
    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { sortOrder: i * 10 });
        i++;
    });
    console.log("Committing batch update for " + (i - 1) + " products...");
    await batch.commit();
    console.log("Done updating sortOrder");
    process.exit(0);
}

run().catch(console.error);
