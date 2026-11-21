"""The shared donation catalogue; clients receive this through the state API."""
import re

ITEM_GROUPS = {
    "Accessories": [("Backpack", "unit"), ("Handbag", "piece"), ("Wallet", "piece")],
    "Clothing": [(name, "piece") for name in ["Shirt", "T-Shirt", "Pants", "Jeans", "Dress", "Jacket", "Sweater", "Coat", "Trousers", "Saree"]] + [("Blanket", "unit")],
    "Education": [("Book", "unit"), ("Notebook", "piece"), ("Textbook", "unit"), ("Pen", "piece"), ("Pencil", "piece"), ("School Bag", "unit"), ("School Stationery", "packet")],
    "Electronics": [(name, "unit") for name in ["Laptop", "Desktop Computer", "Mobile Phone", "Tablet"]],
    "Food": [(name, "kg") for name in ["Rice", "Wheat", "Pulses", "Flour", "Sugar", "Dal / Pulses"]] + [("Cooking Oil", "litre"), ("Milk", "litre"), ("Groceries", "packet"), ("Biscuits", "packet")],
    "Footwear": [(name, "pair") for name in ["Shoes", "Slippers", "Sandals"]],
    "Healthcare": [("Medicine", "strip"), ("First Aid Kit", "box"), ("Medical Kit", "box"), ("Medical Supplies", "box"), ("Toothbrush", "piece"), ("Sanitary Pads", "packet")],
    "Household": [("Utensils", "piece"), ("Water Bottle", "bottle"), ("Furniture", "unit"), ("Towel", "piece"), ("Bedsheet", "unit"), ("Soap", "piece")],
}
DONATION_ITEMS = [
    {"id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"), "name": name, "category": category, "unit": unit}
    for category, items in ITEM_GROUPS.items() for name, unit in items
]
ITEM_BY_ID = {item["id"]: item for item in DONATION_ITEMS}
