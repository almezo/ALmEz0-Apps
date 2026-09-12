const PROJECT_ID = "almez0-servers";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/products`;

async function run() {
    console.log("Fetching products...");
    const res = await fetch(BASE_URL);
    const data = await res.json();
    const docs = data.documents || [];
    
    let i = 1;
    for (const doc of docs) {
        const docName = doc.name;
        console.log(`Updating ${docName} with sortOrder ${i * 10}...`);
        
        const updateUrl = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=sortOrder`;
        const body = {
            fields: {
                sortOrder: { integerValue: String(i * 10) }
            }
        };
        
        const updateRes = await fetch(updateUrl, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
        
        if (!updateRes.ok) {
            console.error(`Failed to update ${docName}:`, await updateRes.text());
        } else {
            console.log(`Successfully updated ${docName}`);
        }
        i++;
    }
    console.log("Done updating sortOrder");
}

run().catch(console.error);
