import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta

# Get list of plants
try:
    with urllib.request.urlopen('http://localhost:8000/api/v1/plants') as response:
        plants = json.loads(response.read().decode('utf-8'))
        plant_ids = [p['id'] for p in plants[:6]]  # Get first 6 plant IDs
except Exception as e:
    print(f"Error getting plants: {e}")
    plant_ids = ['holcim_avondale'] * 6  # Fallback

drivers = ['driver1', 'driver2', 'driver3']
job_site = '45 Queen Street, Auckland, NZ'
base_url = 'http://localhost:8000/api/v1/trips/dispatch'

created_count = 0

# Create 6 trips (2 per driver)
for i in range(6):
    driver = drivers[i % 3]
    plant_id = plant_ids[i] if i < len(plant_ids) else 'holcim_avondale'
    
    payload = {
        'brand': 'Holcim',
        'job_site_address': job_site,
        'total_quantity_m3': 2.0,
        'volume_m3': 2.0,
        'num_trucks': 1,
        'plant_id': plant_id,
        'plant_name': plant_id.replace('_', ' ').title(),
        'scheduled_at': (datetime.now() + timedelta(days=1)).isoformat(),
        'driver_id': driver
    }
    
    try:
        req = urllib.request.Request(base_url, data=json.dumps(payload).encode('utf-8'))
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            trip_id = result.get("id", "?")
            print(f'✓ Trip {i+1} for {driver}: Created (ID: {trip_id})')
            created_count += 1
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode('utf-8')
        print(f'✗ Trip {i+1} for {driver}: {error_msg[:80]}')
    except Exception as e:
        print(f'✗ Trip {i+1} for {driver}: {str(e)[:80]}')

print(f'\n✓ {created_count} trips successfully created!')
