import csv

# Define the corrections
corrections = {
    'S05161': ('45.002778', '10.483333'),  # Sermide
    'S05162': ('45.036111', '10.551111'),  # Felonica
    'S05164': ('44.936111', '10.583333'),  # Stellata Ficarolo
    'S05165': ('44.883333', '10.616667'),  # Bondeno
    'S00084': ('45.190556', '7.588889'),   # Venaria Reale Rigola Stadio
    'S00085': ('45.191667', '7.591667'),   # Venaria Reale Reggia
    'S00086': ('45.168333', '7.615000'),   # Borgaro
    'S00087': ('45.197500', '7.649722'),   # Caselle Torinese
    'S00088': ('45.192500', '7.649444'),   # Torino Aeroporto Di Caselle
    'S00089': ('45.165000', '7.707222'),   # S.Maurizio Canavese
    'S00090': ('45.217500', '7.593889'),   # Cirie'
}

# Read the CSV
csv_path = 'webapp/data/stations.csv'
rows = []
with open(csv_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        code = row.get('code', '')
        if code in corrections:
            row['latitude'], row['longitude'] = corrections[code]
        rows.append(row)

# Write back
with open(csv_path, 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print("✓ Updated all remaining invalid coordinates")
for code in corrections:
    print(f"  {code}: {corrections[code]}")
