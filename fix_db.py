import urllib.request
import json

PROJECT_ID = "almez0-servers"
BASE_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/products"

def get_products():
    req = urllib.request.Request(BASE_URL)
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        return data.get("documents", [])

def update_product_sort_order(doc_name, sort_order):
    url = f"https://firestore.googleapis.com/v1/{doc_name}?updateMask=sortOrder"
    body = json.dumps({
        "fields": {
            "sortOrder": {"integerValue": str(sort_order)}
        }
    }).encode('utf-8')
    req = urllib.request.Request(url, data=body, method="PATCH", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as response:
            pass # print(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Error updating {doc_name}: {e.read().decode()}")

def run():
    print("Fetching products...")
    docs = get_products()
    i = 1
    for doc in docs:
        doc_name = doc["name"]
        print(f"Updating {doc_name} with sortOrder {i * 10}...")
        update_product_sort_order(doc_name, i * 10)
        i += 1
    print("Done updating sortOrder!")

if __name__ == "__main__":
    run()
