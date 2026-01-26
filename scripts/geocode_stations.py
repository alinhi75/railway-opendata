"""
Geocode stations with zero or invalid coordinates using OpenStreetMap Nominatim API
"""
import sys
from pathlib import Path
import csv
import time
import requests
from typing import Optional, Tuple

def read_stations_csv(csv_path):
    """Read stations from CSV file"""
    stations = []
    # Try different encodings
    encodings = ['utf-8-sig', 'utf-8', 'cp1252', 'latin-1', 'iso-8859-1']
    
    for encoding in encodings:
        try:
            with open(csv_path, 'r', encoding=encoding) as f:
                reader = csv.DictReader(f)
                for row in reader:
                    stations.append(row)
            print(f"  Successfully read with encoding: {encoding}")
            return stations
        except UnicodeDecodeError:
            continue
    
    raise RuntimeError(f"Could not read {csv_path} with any encoding")

def has_invalid_coords(station_row):
    """Check if station has invalid coordinates"""
    try:
        lat = float(station_row.get('latitude', 0) or 0)
        lon = float(station_row.get('longitude', 0) or 0)
        
        # Check for zero coordinates
        if lat == 0 or lon == 0:
            return True
        
        # Check for coordinates outside reasonable Italian bounds
        # Italy is roughly: lat 36-47, lon 6-19
        if not (36 <= lat <= 47 and 6 <= lon <= 19):
            return True
            
        return False
    except (ValueError, TypeError):
        return True

def geocode_station(station_name: str, region_code: str = None) -> Optional[Tuple[float, float]]:
    """Geocode station using OpenStreetMap Nominatim"""
    
    # Clean station name
    name = station_name.strip()
    
    # Build query - add "stazione ferroviaria" or "train station" to improve results
    queries = [
        f"{name} stazione ferroviaria Italy",
        f"{name} train station Italy",
        f"{name} railway station Italy",
        f"{name} Italy",
    ]
    
    for query in queries:
        try:
            # Nominatim API
            url = "https://nominatim.openstreetmap.org/search"
            params = {
                'q': query,
                'format': 'json',
                'limit': 1,
                'countrycodes': 'it'  # Restrict to Italy
            }
            headers = {
                'User-Agent': 'Railway-OpenData-Project/1.0'
            }
            
            response = requests.get(url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            
            results = response.json()
            if results and len(results) > 0:
                result = results[0]
                lat = float(result['lat'])
                lon = float(result['lon'])
                
                # Validate coordinates are in Italy
                if 36 <= lat <= 47 and 6 <= lon <= 19:
                    return lat, lon
            
            # Rate limit - Nominatim requires 1 request per second
            time.sleep(1)
            
        except Exception as e:
            print(f"    Error geocoding '{query}': {e}")
            time.sleep(1)
            continue
    
    return None

def main():
    PROJECT_ROOT = Path(__file__).parent.parent
    
    # File paths
    webapp_csv = PROJECT_ROOT / "webapp" / "data" / "stations.csv"
    
    if not webapp_csv.exists():
        print(f"Error: {webapp_csv} not found")
        return
    
    print(f"Reading stations from: {webapp_csv}")
    stations = read_stations_csv(webapp_csv)
    
    # Find stations with invalid coordinates
    invalid_stations = []
    for station in stations:
        if has_invalid_coords(station):
            # Avoid duplicates
            code = station.get('code', '')
            if not any(s.get('code') == code for s in invalid_stations):
                invalid_stations.append(station)
    
    print(f"\nFound {len(invalid_stations)} unique stations with invalid coordinates")
    
    if not invalid_stations:
        print("No stations need fixing!")
        return
    
    # Show first 10 invalid stations
    print("\nFirst 10 stations with invalid coordinates:")
    for station in invalid_stations[:10]:
        code = station.get('code', 'N/A')
        name = station.get('long_name', station.get('name', 'N/A'))
        lat = station.get('latitude', '0')
        lon = station.get('longitude', '0')
        region = station.get('region', 'N/A')
        print(f"  {code}: {name} (region:{region}, coords:{lat}, {lon})")
    
    # Ask user which stations to geocode
    print("\nOptions:")
    print("1. Geocode all stations with zero coordinates only")
    print("2. Geocode all stations with invalid coordinates")
    print("3. Geocode specific station by code")
    print("4. Cancel")
    
    choice = input("\nChoose option (1-4): ").strip()
    
    if choice == '4':
        print("Cancelled.")
        return
    elif choice == '3':
        code = input("Enter station code: ").strip().upper()
        to_geocode = [s for s in invalid_stations if s.get('code', '').upper() == code]
        if not to_geocode:
            print(f"Station {code} not found or has valid coordinates")
            return
    elif choice == '1':
        to_geocode = [s for s in invalid_stations if float(s.get('latitude', 0) or 0) == 0]
    else:  # choice == '2' or default
        to_geocode = invalid_stations
    
    print(f"\nWill geocode {len(to_geocode)} stations")
    response = input("Proceed? (y/n): ")
    if response.lower() != 'y':
        print("Cancelled.")
        return
    
    # Geocode stations
    fixed_count = 0
    not_found_count = 0
    
    print("\nGeocoding stations (this may take a while due to rate limiting)...")
    for i, station in enumerate(to_geocode, 1):
        code = station.get('code', '')
        name = station.get('long_name', station.get('name', 'Unknown'))
        region = station.get('region', '')
        
        print(f"[{i}/{len(to_geocode)}] {code}: {name}...", end=' ', flush=True)
        
        coords = geocode_station(name, region)
        
        if coords:
            lat, lon = coords
            # Update ALL stations with this code
            updated = 0
            for s in stations:
                if s.get('code') == code:
                    s['latitude'] = str(lat)
                    s['longitude'] = str(lon)
                    updated += 1
            print(f"✓ ({lat:.6f}, {lon:.6f}) - updated {updated} entries")
            fixed_count += 1
        else:
            print("✗ Not found")
            not_found_count += 1
    
    print(f"\n✓ Fixed: {fixed_count} stations")
    print(f"✗ Not found: {not_found_count} stations")
    
    if fixed_count > 0:
        # Write updated stations back to CSV
        backup_path = webapp_csv.with_suffix('.csv.geo_backup')
        if not backup_path.exists():
            print(f"\nCreating backup: {backup_path}")
            import shutil
            shutil.copy(webapp_csv, backup_path)
        
        print(f"Writing updated stations to: {webapp_csv}")
        with open(webapp_csv, 'w', encoding='utf-8', newline='') as f:
            fieldnames = stations[0].keys()
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(stations)
        
        print("✓ Done!")

if __name__ == "__main__":
    main()
