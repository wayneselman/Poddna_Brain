from replit import db
import json

data = {}
for key in db.keys():
    value = db[key]
    if hasattr(value, "value"):
        value = value.value
    data[key] = value

with open("brain_db_export.json", "w") as f:
    json.dump(data, f, indent=2, default=str)

print(f"Exported {len(data)} keys to brain_db_export.json")
