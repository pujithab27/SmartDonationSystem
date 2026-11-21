from decimal import Decimal
from .receipt_check import receipt_digest
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.response import Response
from .models import ItemDonation, DonationMatch, Notification, ItemRequest, ItemRequestLine, User, MatchEvent
from .donation_items import ITEM_BY_ID
from .serializers import StrictSerializer, ItemQuantityInput, validate_upload
from .views import BaseView, require_role

LIVE = ['Pending', 'Pickup scheduled']


def match_scope(user, *, admin_read=False):
    query = DonationMatch.objects.select_related('donation__donor', 'request__organization__user').prefetch_related('events__actor')
    if not user.is_authenticated or not user.can_login:
        return query.none()
    if admin_read and user.role == 'admin':
        return query
    if user.role == 'donor':
        return query.filter(donation__donor=user)
    if user.role == 'ngo':
        return query.filter(request__organization__user=user)
    return query.none()


def available(donation):
    return donation.quantity - sum((m.quantity for m in donation.matches.all() if m.status != 'Cancelled'), Decimal(0))


def line_available(line):
    reserved = sum((m.quantity for m in line.request.matches.all() if m.status in LIVE and m.donation.item_key == line.item_key), Decimal(0))
    return line.quantity - line.fulfilled_quantity - reserved


def notify(user, title, message, match=None):
    link = f'/dashboard/{user.role}/matches' + (f'?match={match.pk}' if match else '')
    Notification.objects.create(user=user, title=title, message=message[:500], link=link)


class ItemDonationInput(ItemQuantityInput):
    clientId = serializers.UUIDField(source='client_id')
    city = serializers.CharField(max_length=100)
    address = serializers.CharField(max_length=300)
    state = serializers.CharField(max_length=100)
    pincode = serializers.RegexField(r'^[1-9]\d{5}$', max_length=6)
    notes = serializers.CharField(max_length=2000, allow_blank=True, default='')
    image = serializers.CharField(allow_blank=True, default='', max_length=940000)

    def validate_image(self, value):
        return validate_upload(value, ['image/png', 'image/jpeg', 'image/webp']) if value else ''


class MatchInput(StrictSerializer):
    donationId = serializers.IntegerField(min_value=1)
    requestId = serializers.IntegerField(min_value=1)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('1'), max_value=Decimal('1000000'))

    def validate_quantity(self, value):
        if value % 1:
            raise serializers.ValidationError('Use a whole number such as 3 or 4.')
        return value


class ItemDonationEditInput(ItemDonationInput):
    clientId = None
    version = serializers.IntegerField(min_value=0)


class DeleteInput(StrictSerializer):
    version = serializers.IntegerField(min_value=0)


class MatchActionInput(StrictSerializer):
    action = serializers.ChoiceField(choices=['schedule', 'confirm', 'cancel'])
    version = serializers.IntegerField(min_value=0)
    deliveryProof = serializers.CharField(source='delivery_proof', required=False, max_length=940000)
    deliveryNote = serializers.CharField(source='delivery_note', max_length=1000, allow_blank=True, default='')
    itemMatchConfirmed = serializers.BooleanField(required=False, default=False)

    def validate_deliveryProof(self, value):
        return validate_upload(value, ['image/png', 'image/jpeg', 'image/webp'])

    pickupAt = serializers.DateTimeField(source='pickup_at', required=False)
    pickupAddress = serializers.CharField(source='pickup_address', max_length=300, required=False)
    pickupCity = serializers.CharField(source='pickup_city', max_length=100, required=False)
    pickupState = serializers.CharField(source='pickup_state', max_length=100, required=False)
    pickupPincode = serializers.RegexField(r'^[1-9]\d{5}$', source='pickup_pincode', required=False)
    pickupNotes = serializers.CharField(source='pickup_notes', max_length=1000, allow_blank=True, default='')

    def validate(self, attrs):
        if attrs['action'] == 'confirm' and not attrs.get('delivery_proof'):
            raise serializers.ValidationError({'deliveryProof': 'Upload a photo of the received items before confirming delivery.'})
        if attrs['action'] == 'confirm' and not attrs.get('itemMatchConfirmed'):
            raise serializers.ValidationError({'itemMatchConfirmed': 'Review the received photo and confirm that it matches the donated item.'})
        if attrs['action'] != 'confirm' and (attrs.get('delivery_proof') or attrs.get('delivery_note')):
            raise serializers.ValidationError('Delivery proof is accepted only when confirming receipt.')
        if attrs['action'] != 'confirm' and attrs.get('itemMatchConfirmed'):
            raise serializers.ValidationError('Item confirmation is only accepted when confirming receipt.')
        if attrs['action'] == 'schedule':
            required = ['pickup_at', 'pickup_address', 'pickup_city', 'pickup_state', 'pickup_pincode']
            if any(not attrs.get(key) for key in required):
                raise serializers.ValidationError('Enter the pickup date, time and complete pickup address.')
            if attrs['pickup_at'] <= timezone.now():
                raise serializers.ValidationError('Choose a future pickup date and time.')
        elif any(key.startswith('pickup_') and value for key, value in attrs.items()):
            raise serializers.ValidationError('Pickup details are only accepted when scheduling.')
        return attrs


def donation_data(donation):
    matches = list(donation.matches.all())
    completed = sum((m.quantity for m in matches if m.status == 'Completed'), Decimal(0))
    remaining = available(donation)
    status = 'Completed' if completed == donation.quantity else 'Partly delivered' if completed else 'Pickup scheduled' if any(m.status == 'Pickup scheduled' for m in matches) else 'Matched' if any(m.status == 'Pending' for m in matches) else 'Pending'
    return {'id': donation.pk, 'itemId': donation.item_key, **{k: ITEM_BY_ID[donation.item_key][k] for k in ['name', 'category', 'unit']},
            'quantity': donation.quantity, 'available': remaining, 'completed': completed, 'status': status,
            'city': donation.city, 'address': donation.address, 'state': donation.state, 'pincode': donation.pincode,
            'notes': donation.notes, 'hasImage': bool(donation.image), 'createdAt': donation.created_at,
            'version': donation.version, 'canEdit': not matches, 'canDelete': not matches}


def match_data(match):
    donation, entry = match.donation, match.request
    item = ITEM_BY_ID[donation.item_key]
    return {'id': match.pk, 'donationId': donation.pk, 'requestId': entry.pk, 'requestTitle': entry.title,
            'name': item['name'], 'category': item['category'], 'unit': item['unit'], 'quantity': match.quantity,
            'ngoId': entry.organization_id, 'ngoName': entry.organization.name, 'donorName': donation.donor.display_name,
            'contactPhone': entry.contact_phone, 'donorPhone': donation.donor.phone,
            'receiptCheck': match.receipt_check, 'hasDeliveryProof': bool(match.delivery_proof), 'deliveryNote': match.delivery_note,
            'events': [{'id': e.pk, 'title': e.title, 'message': e.message, 'createdAt': e.created_at, 'actorRole': e.actor.role if e.actor else ''} for e in match.events.all()],
            'deliveryAddress': entry.delivery_address, 'deliveryCity': entry.delivery_city,
            'deliveryState': entry.delivery_state, 'deliveryPincode': entry.delivery_pincode,
            'notes': donation.notes, 'hasImage': bool(donation.image), 'status': match.status, 'version': match.version,
            'pickupAt': match.pickup_at, 'pickupAddress': match.pickup_address, 'pickupCity': match.pickup_city,
            'pickupState': match.pickup_state, 'pickupPincode': match.pickup_pincode, 'pickupNotes': match.pickup_notes,
            'createdAt': match.created_at, 'completedAt': match.completed_at}


def exchange_state(user):
    if user.is_authenticated and user.can_login and user.role == 'admin':
        donations = ItemDonation.objects.select_related('donor').prefetch_related('matches')
        return {
            'itemDonations': [{**donation_data(d), 'donorEmail': d.donor.email, 'donorName': d.donor.display_name} for d in donations],
            'matches': [{**match_data(m), 'donorEmail': m.donation.donor.email, 'ngoEmail': m.request.organization.user.email} for m in match_scope(user, admin_read=True)],
            'notifications': [], 'unreadNotifications': 0,
        }
    if not user.is_authenticated or not user.can_login or user.role not in ['donor', 'ngo']:
        return {'itemDonations': [], 'matches': [], 'notifications': [], 'unreadNotifications': 0}
    donations = ItemDonation.objects.filter(donor=user).prefetch_related('matches') if user.role == 'donor' else []
    notices = Notification.objects.filter(user=user)
    return {'itemDonations': [donation_data(d) for d in donations], 'matches': [match_data(m) for m in match_scope(user)],
            'notifications': [{'id': n.pk, 'title': n.title, 'message': n.message, 'link': n.link, 'read': n.read, 'createdAt': n.created_at} for n in notices[:100]],
            'unreadNotifications': notices.filter(read=False).count()}


class ItemDonationListView(BaseView):
    def post(self, request):
        require_role(request, 'donor')
        serializer = ItemDonationInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data.copy()
        with transaction.atomic():
            donor = User.objects.select_for_update().get(pk=request.user.pk)
            if not donor.can_login:
                raise PermissionDenied('Your account must be approved and active.')
            client_id = fields.pop('client_id')
            donation, created = ItemDonation.objects.get_or_create(donor=donor, client_id=client_id, defaults=fields)
            if not created and any(getattr(donation, key) != value for key, value in fields.items()):
                return Response({'detail': 'This submission was already saved with different details. Refresh before trying again.'}, status=409)
            if created:
                notify(donor, 'Donation submitted', f"Your offer of {donation.quantity:g} {ITEM_BY_ID[donation.item_key]['unit']} of {ITEM_BY_ID[donation.item_key]['name']} is ready to match.")
        return Response(donation_data(donation), status=201 if created else 200)


class ItemDonationDetailView(BaseView):
    def patch(self, request, pk):
        require_role(request, 'donor')
        serializer = ItemDonationEditInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data.copy()
        with transaction.atomic():
            donation = get_object_or_404(ItemDonation.objects.select_for_update(), pk=pk, donor=request.user)
            if fields.pop('version') != donation.version:
                return Response({'detail': 'This donation changed. Reopen it before saving.'}, status=409)
            if donation.matches.exists():
                raise ValidationError('This donation has match history. Create a new offer for different items or manage the existing matches.')
            for name, value in fields.items():
                setattr(donation, name, value)
            donation.version += 1
            donation.save()
        return Response(donation_data(donation))

    def delete(self, request, pk):
        require_role(request, 'donor')
        serializer = DeleteInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            donation = get_object_or_404(ItemDonation.objects.select_for_update(), pk=pk, donor=request.user)
            if serializer.validated_data['version'] != donation.version:
                return Response({'detail': 'This donation changed. Refresh before deleting it.'}, status=409)
            if donation.matches.exists():
                raise ValidationError('Donations with match history cannot be deleted. Manage their matches instead.')
            donation.delete()
        return Response({'deleted': True})

    def get(self, request, pk):
        query = ItemDonation.objects.filter(donor=request.user) if request.user.role == 'donor' else ItemDonation.objects.filter(matches__request__organization__user=request.user).distinct() if request.user.role == 'ngo' else ItemDonation.objects.none()
        donation = get_object_or_404(query, pk=pk)
        return Response({**donation_data(donation), 'image': donation.image})


class MatchCandidatesView(BaseView):
    def get(self, request, pk):
        require_role(request, 'donor')
        donation = get_object_or_404(ItemDonation.objects.prefetch_related('matches'), pk=pk, donor=request.user)
        remaining = available(donation)
        if remaining < 1:
            return Response([])
        lines = ItemRequestLine.objects.filter(item_key=donation.item_key, request__status='Open',
            request__organization__status='Verified', request__organization__user__is_active=True,
            request__organization__user__approval_status='Approved').filter(Q(request__needed_by__isnull=True) | Q(request__needed_by__gte=timezone.localdate())).select_related('request__organization').prefetch_related('request__matches__donation')
        existing = set(donation.matches.exclude(status='Cancelled').values_list('request_id', flat=True))
        result = []
        for line in lines:
            entry = line.request
            room = line_available(line)
            if room < 1 or entry.pk in existing:
                continue
            nearby = entry.delivery_city.casefold().strip() == donation.city.casefold().strip()
            result.append({'requestId': entry.pk, 'title': entry.title, 'ngoName': entry.organization.name,
                'city': entry.delivery_city, 'priority': entry.priority, 'neededBy': entry.needed_by,
                'available': room, 'suggestedQuantity': int(min(room, remaining)), 'sameCity': nearby,
                'reason': 'Same item and city' if nearby else 'Same item; another city'})
        result.sort(key=lambda c: (not c['sameCity'], {'High': 0, 'Medium': 1, 'Low': 2}[c['priority']], str(c['neededBy'] or '9999-12-31'), c['requestId']))
        return Response(result)


class MatchListView(BaseView):
    def post(self, request):
        require_role(request, 'donor')
        serializer = MatchInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            donation = get_object_or_404(ItemDonation.objects.select_for_update(), pk=values['donationId'], donor=request.user)
            entry = get_object_or_404(ItemRequest.objects.select_for_update().select_related('organization__user'), pk=values['requestId'])
            if not donation.donor.can_login or not entry.organization.user.can_login or entry.organization.status != 'Verified':
                raise PermissionDenied('Both accounts must be approved and active to make a match.')
            if entry.status != 'Open' or (entry.needed_by and entry.needed_by < timezone.localdate()):
                raise ValidationError('This request is closed or its required date has passed.')
            line = get_object_or_404(ItemRequestLine.objects.select_for_update(), request=entry, item_key=donation.item_key)
            if donation.matches.filter(request=entry).exclude(status='Cancelled').exists():
                return Response({'detail': 'This donation is already matched to that request.'}, status=409)
            quantity = values['quantity']
            if quantity % 1:
                raise ValidationError('Use a whole quantity for this item.')
            if quantity > min(available(donation), line_available(line)):
                return Response({'detail': 'The available quantity has changed. Refresh matches and try again.'}, status=409)
            match = DonationMatch.objects.create(donation=donation, request=entry, quantity=quantity,
                pickup_address=donation.address, pickup_city=donation.city,
                pickup_state=donation.state, pickup_pincode=donation.pincode)
            entry.version += 1
            entry.save(update_fields=['version', 'updated_at'])
            MatchEvent.objects.create(match=match, actor=request.user, title='Donation matched', message=f"{quantity:g} {ITEM_BY_ID[donation.item_key]['unit']} of {ITEM_BY_ID[donation.item_key]['name']} reserved for {entry.organization.name}.")
            for user in [donation.donor, entry.organization.user]:
                notify(user, 'Donation matched', f"{quantity:g} {ITEM_BY_ID[donation.item_key]['unit']} of {ITEM_BY_ID[donation.item_key]['name']} matched with {entry.organization.name}. Schedule a pickup next.", match)
        return Response(match_data(match), status=201)


class MatchDetailView(BaseView):
    def get(self, request, pk):
        match = get_object_or_404(match_scope(request.user, admin_read=True), pk=pk)
        return Response({**match_data(match), 'donationImage': match.donation.image, 'deliveryProof': match.delivery_proof})

    def patch(self, request, pk):
        serializer = MatchActionInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data.copy()
        with transaction.atomic():
            # Lock the donation and request before the match, in the same order as matching.
            scoped = get_object_or_404(match_scope(request.user), pk=pk)
            ItemDonation.objects.select_for_update().get(pk=scoped.donation_id)
            entry = ItemRequest.objects.select_for_update().get(pk=scoped.request_id)
            match = DonationMatch.objects.select_for_update().select_related('donation__donor', 'request__organization__user').get(pk=pk)
            if values.pop('version') != match.version:
                return Response({'detail': 'This match has changed. Refresh before continuing.'}, status=409)
            action = values.pop('action')
            if match.status in ['Completed', 'Cancelled']:
                raise ValidationError('This match is already closed.')
            if action != 'cancel' and (not match.donation.donor.can_login or not match.request.organization.user.can_login or match.request.organization.status != 'Verified'):
                raise PermissionDenied('Both accounts must be approved and active to continue.')
            if action == 'schedule':
                require_role(request, 'donor')
                for key, value in values.items():
                    if key.startswith('pickup_'):
                        setattr(match, key, value)
                match.status = 'Pickup scheduled'
                title, message = 'Pickup scheduled', f"Pickup for {ITEM_BY_ID[match.donation.item_key]['name']} is scheduled for {timezone.localtime(match.pickup_at):%d %b %Y, %I:%M %p} IST."
            elif action == 'confirm':
                require_role(request, 'ngo')
                if match.status != 'Pickup scheduled':
                    raise ValidationError('A pickup must be scheduled before confirming physical receipt.')
                if match.receipt_check_digest != receipt_digest(match, values['delivery_proof']) or match.receipt_check.get('status') != 'match':
                    raise ValidationError('Check the received photo against the donation first. A different or unclear item cannot be confirmed; upload a clear photo of the correct items and check again.')
                line = get_object_or_404(ItemRequestLine.objects.select_for_update(), request=entry, item_key=match.donation.item_key)
                if line.fulfilled_quantity + match.quantity > line.quantity:
                    raise ValidationError('This receipt exceeds the requested quantity.')
                line.fulfilled_quantity += match.quantity
                line.save(update_fields=['fulfilled_quantity'])
                match.status, match.completed_at = 'Completed', timezone.now()
                match.delivery_proof = values['delivery_proof']
                match.delivery_note = values.get('delivery_note', '')
                title, message = 'Donation completed', f"{match.request.organization.name} confirmed receipt of {match.quantity:g} {ITEM_BY_ID[match.donation.item_key]['unit']} of {ITEM_BY_ID[match.donation.item_key]['name']}."
                entry.version += 1
                entry.save(update_fields=['version', 'updated_at'])
            else:
                match.status = 'Cancelled'
                title, message = 'Match cancelled', f"The match for {ITEM_BY_ID[match.donation.item_key]['name']} was cancelled. Its reserved quantity is available again."
                entry.version += 1
                entry.save(update_fields=['version', 'updated_at'])
            match.version += 1
            match.save()
            MatchEvent.objects.create(match=match, actor=request.user, title=title, message=message[:500])
            for user in [match.donation.donor, match.request.organization.user]:
                notify(user, title, message, match)
        return Response(match_data(match))


class NotificationReadView(BaseView):
    def post(self, request):
        class ReadInput(StrictSerializer):
            id = serializers.IntegerField(min_value=1, required=False)
        serializer = ReadInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        notices = Notification.objects.filter(user=request.user)
        if 'id' in serializer.validated_data:
            notice = get_object_or_404(notices, pk=serializer.validated_data['id'])
            notices = notices.filter(pk=notice.pk)
        notices.update(read=True)
        return Response({'detail': 'Notifications marked as read.'})
