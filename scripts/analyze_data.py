import pandas as pd
from pathlib import Path

# Load a single day's data
file = Path("data/railway-opendata/2024-08-16/trains.csv")
df = pd.read_csv(file)

print("=" * 60)
print("DATA STRUCTURE ANALYSIS")
print("=" * 60)
print(f"\nTotal rows: {len(df)}")
print(f"Columns: {df.columns.tolist()}")

print("\n\nArrival Delay Stats:")
print(df['arrival_delay'].describe())

print("\n\nDeparture Delay Stats:")
print(df['departure_delay'].describe())

print("\n\nSample rows with delays:")
print(df[['stop_number', 'stop_station_code', 'arrival_delay', 'departure_delay']].head(20))

print("\n\nNegative delays (early arrivals):")
early = df[df['arrival_delay'] < 0]
print(f"Count: {len(early)}")
if len(early) > 0:
    print(f"Min: {early['arrival_delay'].min()}")
    print(f"Sample:")
    print(early[['stop_number', 'stop_station_code', 'arrival_delay']].head(5))

print("\n\nData issues check:")
print(f"NaN in arrival_delay: {df['arrival_delay'].isna().sum()}")
print(f"NaN in departure_delay: {df['departure_delay'].isna().sum()}")
print(f"\nNote: Each row is a STOP on a train journey, not a unique train")
print(f"So 86k rows = 86k stops across all trains on one day")
