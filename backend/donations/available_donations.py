"""NGO discovery of unallocated offers and donor-directed interest notifications."""
from django.db import transaction, IntegrityError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from .models import ItemDonation, ItemRequest, ItemRequestLine, Notification, Organization
from .donation_items import ITEM_BY_ID
from .exchange import available, line_available
from .serializers import StrictSerializer
from .views import BaseView, require_role


def organization(request):
    require_role(request, 'ngo')
    if not request.user.can_login:
        raise PermissionDenied('Your account must be approved and active.')
    return get_object_or_404(Organization, user=request.user, status='Verified')


def open_lines(org):
    return ItemRequestLine.objects.filter(request__organization=org, request__status='Open').filter(
        Q(request__needed_by__isnull=True) | Q(request__needed_by__gte=timezone.localdate())
    ).select_related('request').prefetch_related('request__matches__donation')


def interest_link(donation_id, request_id):
    return f'/dashboard/donor/matches?donation={donation_id}&request={request_id}'


class AvailableDonationsView(BaseView):
    def get(self, request):
        org = organization(request)
        lines = [line for line in open_lines(org) if line_available(line) > 0]
        offers = []
        donations = ItemDonation.objects.filter(donor__is_active=True, donor__approval_status='Approved').prefetch_related('matches')
        links = Notification.objects.filter(title='NGO interested').values_list('user_id', 'link')
        sent = set(links)
        quick_requests = {entry.source_donation_id: entry for entry in ItemRequest.objects.filter(organization=org, source_donation__isnull=False).prefetch_related('items')}
        for donation in donations:
            remaining = available(donation)
            if remaining <= 0:
                continue
            choices = [{'id': line.request_id, 'title': line.request.title,
                        'interested': (donation.donor_id, interest_link(donation.pk, line.request_id)) in sent}
                       for line in lines if line.item_key == donation.item_key and not any(
                           match.request_id == line.request_id and match.status != 'Cancelled' for match in donation.matches.all())]
            offers.append({'itemId': donation.item_key, **ITEM_BY_ID[donation.item_key],
                           'id': donation.pk, 'available': remaining, 'city': donation.city,
                           'image': donation.image, 'notes': donation.notes, 'createdAt': donation.created_at, 'requests': choices,
                           'interestRequestId': quick_requests[donation.pk].pk if donation.pk in quick_requests else None})
        return Response(offers)


class InterestInput(StrictSerializer):
    requestId = serializers.IntegerField(min_value=1, required=False)
    quantity = serializers.IntegerField(min_value=1, max_value=1000000, required=False)

    def validate(self, attrs):
        if ('requestId' in attrs) == ('quantity' in attrs):
            raise serializers.ValidationError('Choose an existing request or enter the quantity needed.')
        return attrs


class DonationInterestView(BaseView):
    def post(self, request, pk):
        org = organization(request)
        serializer = InterestInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                donation = get_object_or_404(ItemDonation.objects.select_for_update(), pk=pk,
                                            donor__is_active=True, donor__approval_status='Approved')
                if 'quantity' in serializer.validated_data:
                    existing = ItemRequest.objects.filter(organization=org, source_donation=donation).first()
                    if existing:
                        return Response({'detail': 'Your interest is already recorded. View it in My requests.', 'requestId': existing.pk})
                if available(donation) <= 0:
                    raise ValidationError('This donation is no longer available. Refresh the list.')
                if 'quantity' in serializer.validated_data:
                    quantity = serializer.validated_data['quantity']
                    if quantity > available(donation):
                        raise ValidationError({'quantity': 'This exceeds the quantity still available. Refresh the list.'})
                    user = request.user
                    if not all([user.address.strip(), user.city.strip(), user.state.strip(), user.pincode.strip(), user.phone.strip()]):
                        raise ValidationError('Complete your NGO profile address, city, state, PIN code and phone once before requesting an offer.')
                    entry = ItemRequest.objects.create(organization=org, source_donation=donation,
                        title=f'{ITEM_BY_ID[donation.item_key]["name"]} from donation #{donation.pk}',
                        delivery_address=user.address, delivery_city=user.city, delivery_state=user.state,
                        delivery_pincode=user.pincode, contact_phone=user.phone)
                    line = ItemRequestLine.objects.create(request=entry, item_key=donation.item_key, quantity=quantity)
                else:
                    line = get_object_or_404(open_lines(org), request_id=serializer.validated_data['requestId'], item_key=donation.item_key)
                if line_available(line) <= 0 or donation.matches.filter(request=line.request).exclude(status='Cancelled').exists():
                    raise ValidationError('This request is already covered. Refresh the list.')
                Notification.objects.get_or_create(user=donation.donor, title='NGO interested',
                    link=interest_link(donation.pk, line.request_id), defaults={
                        'message': f'{org.name} is interested in your {ITEM_BY_ID[donation.item_key]["name"]} donation for "{line.request.title}". Open details to review the matched quantity and confirm pickup.'[:500]})
        except IntegrityError:
            existing = ItemRequest.objects.filter(organization=org, source_donation_id=pk).first()
            if existing:
                return Response({'detail': 'Your interest is already recorded. View it in My requests.', 'requestId': existing.pk})
            raise ValidationError('Could not save interest. Refresh the list and try again.')
        return Response({'detail': 'Interest sent. Your item request is saved; the donor will confirm the match before pickup.', 'requestId': line.request_id})
