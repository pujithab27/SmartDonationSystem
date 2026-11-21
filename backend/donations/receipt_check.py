import hashlib
import json


def receipt_digest(match, proof):
    return hashlib.sha256(json.dumps([match.donation.item_key, match.donation.image, proof]).encode()).hexdigest()
