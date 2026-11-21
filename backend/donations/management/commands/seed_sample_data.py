from datetime import timedelta
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from donations.models import User, Organization, Campaign

SAMPLES = [
    ("hello@brightfuture.example", "Bright Future Foundation", "DEMO-001", "Education", "Vijayawada", "Andhra Pradesh",
     "Opening doors through education and community learning.", "req-101", "A school bag. A world of possibilities.",
     "Help 80 children start the school year with notebooks, school bags, and the confidence to learn.", 32000, 18000, "80 school-age children", "education.jpg"),
    ("info@careshare.example", "Care & Share Trust", "DEMO-002", "Food", "Hyderabad", "Telangana",
     "Helping families build healthier lives, one nourishing meal at a time.", "req-102", "A warm meal. A little more hope.",
     "Bring nutritious food packages to families facing food insecurity in our communities.", 25000, 9000, "100 families", "food.jpg"),
    ("hello@hopehealth.example", "Hope Health Initiative", "DEMO-003", "Healthcare", "Mysuru", "Karnataka",
     "Bringing essential healthcare closer to underserved rural communities.", "req-103", "Care should never be out of reach.",
     "Equip rural clinics with first-aid supplies and everyday medical essentials for better care.", 42000, 11000, "Three rural clinics", "healthcare.jpg"),
]


class Command(BaseCommand):
    help = "Add the three illustrative UI campaigns. No login passwords or administrators are created."

    @transaction.atomic
    def handle(self, *args, **options):
        for email, name, registration, category, city, state, mission, pk, title, story, need, raised, beneficiaries, image in SAMPLES:
            user, created = User.objects.get_or_create(email=email, defaults={"role": "ngo", "city": city, "state": state, "approval_status": "Approved"})
            if created:
                user.set_unusable_password()
                user.save(update_fields=["password"])
            elif user.role != "ngo" or user.has_usable_password():
                raise CommandError(f"Refusing to modify an existing login account: {email}")
            org, _ = Organization.objects.get_or_create(user=user, defaults={
                "name": name, "registration_number": registration, "category": category,
                "description": mission, "status": "Verified",
            })
            Campaign.objects.get_or_create(pk=pk, defaults={
                "organization": org, "title": title, "category": category, "description": story,
                "need": need, "raised": raised, "status": "Active", "location": state,
                "beneficiaries": beneficiaries, "image": f"/images/{image}",
                "start_date": timezone.localdate(), "end_date": timezone.localdate() + timedelta(days=365),
            })
        self.stdout.write(self.style.SUCCESS("Sample organizations and campaigns are ready. Their accounts cannot sign in."))
