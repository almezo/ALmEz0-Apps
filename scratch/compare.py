import urllib.request
import json
import re

refresh_token = 'AMf-vBwuCGuaSbH8tF6rsaPuFW8dTiMZnZb1bMo7rsRQJjTCpZJBbh2eF9754a44Mgb8ASq0X5HhlVJp5ep0Q-D8lgdkLeu5nf5ihovkd6xEyVLAm9KRySoAkrbX01XlkYIU90-w1ttiVo-gigYWlE5HxDgrVjn-PLR9X-31LdbAN2NctMW30Agcl5EDbo6KSJTVjOZYlB1b1mcP-OiApUDAoonJU9TVbA'

with open('firebase-config.js', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'apiKey:\s*["\']([^"\']+)["\']', text)
apiKey = m.group(1) if m else ''

data = json.dumps({'grant_type': 'refresh_token', 'refresh_token': refresh_token}).encode()
req = urllib.request.Request(f'https://securetoken.googleapis.com/v1/token?key={apiKey}', data=data, headers={'Content-Type': 'application/json'})
res = urllib.request.urlopen(req)
token_data = json.loads(res.read())
print("USER_ID:", token_data.get('user_id'))
id_token = token_data['id_token']

url = 'https://firestore.googleapis.com/v1/projects/almezo-4e2e1/databases/(default)/documents/customers/INkndEX0c0fyEBfJXnDg8903S8f1'
r = urllib.request.Request(url, headers={'Authorization': f'Bearer {id_token}'})
res = json.loads(urllib.request.urlopen(r).read())
fields = res.get('fields', {})
print('Ayoub fields:')
for k in ['baseCash', 'duesOwed', 'baseProfit', 'baseLibyana', 'baseAlmadar']:
    print(k, fields.get(k))
    f = doc.get('fields', {})
    if f.get('role', {}).get('stringValue') == 'staff':
        name = f.get('firstName', {}).get('stringValue') or f.get('name', {}).get('stringValue') or ''
        staff.append({
            'id': doc['name'].split('/')[-1],
            'name': name,
            'baseCash': float(f.get('baseCash', {}).get('doubleValue') or f.get('baseCash', {}).get('integerValue') or 0),
            'baseLibyana': float(f.get('baseLibyana', {}).get('doubleValue') or f.get('baseLibyana', {}).get('integerValue') or 0),
            'baseAlmadar': float(f.get('baseAlmadar', {}).get('doubleValue') or f.get('baseAlmadar', {}).get('integerValue') or 0),
            'baseProfit': float(f.get('baseProfit', {}).get('doubleValue') or f.get('baseProfit', {}).get('integerValue') or 0),
            'duesOwed': float(f.get('duesOwed', {}).get('doubleValue') or f.get('duesOwed', {}).get('integerValue') or 0),
            'lastWeekStart': f.get('lastWeekStart', {}).get('stringValue') or ''
        })

print(f"Loaded {len(staff)} staff members:")
for s in staff:
    print(s)
