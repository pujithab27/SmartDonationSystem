from rest_framework.authentication import SessionAuthentication
from django.contrib.auth import logout


class CsrfSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        # DRF normally checks CSRF only for authenticated sessions. Login and
        # signup also need protection, before a session exists.
        self.enforce_csrf(request)
        result = super().authenticate(request)
        if result and not result[0].can_login:
            logout(request._request)
            return None
        return result
