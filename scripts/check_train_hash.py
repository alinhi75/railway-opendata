import pandas as pd
from pathlib import Path

# Load a single day's data
file = Path("data/railway-opendata/2024-08-16/trains.csv")
df = pd.read_csv(file)

print("=" * 60)
print("TRAIN HASH ANALYSIS")
print("=" * 60)
print(f"Total rows (stops): {len(df)}")
print(f"Has 'train_hash' column: {'train_hash' in df.columns}")

if 'train_hash' in df.columns:
    unique_trains = df['train_hash'].nunique()
    print(f"Unique trains (by hash): {unique_trains}")
    print(f"Average stops per train: {len(df) / unique_trains:.2f}")
    
    # Check for missing values
    print(f"\nMissing train_hash: {df['train_hash'].isna().sum()}")
    
    # Show distribution
    print(f"\nTrain hash distribution:")
    print(df['train_hash'].value_counts().head(10))
else:
    print("ERROR: train_hash column not found!")
    print(f"Available columns: {df.columns.tolist()}")
