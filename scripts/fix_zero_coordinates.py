"""
Fix stations with zero or invalid coordinates by fetching from ViaggiaTreno API
"""
import sys
from pathlib import Path
import csv
import time

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.scraper.station import Station

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
        except Exception as e:
            print(f"  Error with encoding {encoding}: {e}")
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

def fetch_station_coords(station_code):
    """Fetch station coordinates from ViaggiaTreno API"""
    try:
        # Get station info from API
        station = Station.by_code(station_code)
        if station and station.position and len(station.position) == 2:
            lat, lon = station.position
            if lat and lon and lat != 0 and lon != 0:
                return lat, lon
    except Exception as e:
        print(f"  Error fetching {station_code}: {e}")
    return None, None

def main():
    # File paths
    webapp_csv = PROJECT_ROOT / "webapp" / "data" / "stations.csv"
    data_csv = PROJECT_ROOT / "data" / "stations.csv"
    
    # Choose which file to fix
    csv_path = webapp_csv if webapp_csv.exists() else data_csv
    
    if not csv_path.exists():
        print(f"Error: {csv_path} not found")
        return
    
    print(f"Reading stations from: {csv_path}")
    stations = read_stations_csv(csv_path)
    
    # Find stations with invalid coordinates
    invalid_stations = []
    for station in stations:
        if has_invalid_coords(station):
            invalid_stations.append(station)
    
    print(f"\nFound {len(invalid_stations)} stations with invalid coordinates")
    
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
        print(f"  {code}: {name} ({lat}, {lon})")
    
    # Ask user if they want to proceed
    response = input(f"\nFetch correct coordinates for {len(invalid_stations)} stations? (y/n): ")
    if response.lower() != 'y':
        print("Cancelled.")
        return
    
    # Fetch correct coordinates
    fixed_count = 0
    not_found_count = 0
    
    print("\nFetching coordinates...")
    for i, station in enumerate(invalid_stations, 1):
        code = station.get('code', '')
        name = station.get('long_name', station.get('name', 'Unknown'))
        
        print(f"[{i}/{len(invalid_stations)}] {code}: {name}...", end=' ')
        
        lat, lon = fetch_station_coords(code)
        
        if lat and lon:
            # Update the station in the list
            for s in stations:
                if s.get('code') == code:
                    s['latitude'] = str(lat)
                    s['longitude'] = str(lon)
                    break
            print(f"✓ ({lat:.6f}, {lon:.6f})")
            fixed_count += 1
        else:
            print("✗ Not found")
            not_found_count += 1
        
        # Rate limiting
        time.sleep(0.1)
    
    print(f"\n✓ Fixed: {fixed_count}")
    print(f"✗ Not found: {not_found_count}")
    
    if fixed_count > 0:
        # Write updated stations back to CSV
        backup_path = csv_path.with_suffix('.csv.backup')
        print(f"\nCreating backup: {backup_path}")
        csv_path.rename(backup_path)
        
        print(f"Writing updated stations to: {csv_path}")
        with open(csv_path, 'w', encoding='utf-8', newline='') as f:
            fieldnames = stations[0].keys()
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(stations)
        
        print("✓ Done!")
        
        # Also update webapp data if we fixed the main data
        if csv_path == data_csv and webapp_csv.exists():
            response = input(f"\nAlso update {webapp_csv}? (y/n): ")
            if response.lower() == 'y':
                print(f"Copying to {webapp_csv}")
                import shutil
                shutil.copy(csv_path, webapp_csv)
                print("✓ Updated webapp data")

if __name__ == "__main__":
    main()
