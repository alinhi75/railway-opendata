import pandas as pd
from pathlib import Path
from datetime import date, timedelta

# Simulate what the backend does
DATA_RAW_DIR = Path("data/railway-opendata")

# Get the last 30 days of data
end_date = date(2024, 12, 1)  # Latest available
start_date = end_date - timedelta(days=29)

print(f"Testing date range: {start_date} to {end_date}")
print("=" * 60)

# Load all CSV files in the date range
frames = []
for single_date in pd.date_range(start_date, end_date, freq='D'):
    date_str = single_date.strftime('%Y-%m-%d')
    csv_file = DATA_RAW_DIR / date_str / "trains.csv"
    
    if csv_file.exists():
        try:
            df = pd.read_csv(csv_file, usecols=['train_hash', 'arrival_delay'])
            frames.append(df)
            print(f"✓ Loaded {date_str}: {len(df)} rows")
        except Exception as e:
            print(f"✗ Error loading {date_str}: {e}")
    else:
        print(f"✗ File not found: {date_str}")

if frames:
    combined_df = pd.concat(frames, axis=0, ignore_index=True)
    
    print("\n" + "=" * 60)
    print("RESULTS:")
    print("=" * 60)
    print(f"Total rows (stops): {len(combined_df):,}")
    print(f"Unique trains: {combined_df['train_hash'].nunique():,}")
    print(f"Average stops per train: {len(combined_df) / combined_df['train_hash'].nunique():.2f}")
    
    # Check arrival delay stats
    print(f"\nArrival Delay Statistics:")
    print(combined_df['arrival_delay'].describe())
else:
    print("No data files found!")
