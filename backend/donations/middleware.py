"""Select a tab's cookies without changing Django's authentication machinery."""
import re
from http.cookies import Morsel

from django.conf import settings
from django.http import JsonResponse
from django.utils.cache import patch_vary_headers


class SessionScopeMiddleware:
    """A scope is a cookie selector, never an authentication credential.

    Run before SessionMiddleware and CsrfViewMiddleware. They see their usual
    cookie names, but only the values belonging to the requested scope. Responses
    rename those cookies back without changing HttpOnly/Secure/SameSite flags.
    Requests without a scope retain standard Django behavior (including admin).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        scope = request.headers.get("X-Session-Scope")
        if scope is None or not request.path.startswith("/api/"):
            return self.get_response(request)
        if not re.fullmatch(r"[a-f0-9]{32}", scope):
            return JsonResponse({"detail": "Invalid session scope. Reload this tab."},
                                status=400, headers={"Cache-Control": "no-store"})

        names = (settings.SESSION_COOKIE_NAME, settings.CSRF_COOKIE_NAME)
        original = request.COOKIES
        request.COOKIES = original.copy()
        for name in names:
            # A missing scoped cookie must never fall back to another login.
            request.COOKIES.pop(name, None)
            value = original.get(f"{name}_{scope}")
            if value is not None:
                request.COOKIES[name] = value

        response = self.get_response(request)
        for name in names:
            if name not in response.cookies:
                continue
            cookie = response.cookies.pop(name)
            scoped_name = f"{name}_{scope}"
            scoped_cookie = Morsel()
            scoped_cookie.set(scoped_name, cookie.value, cookie.coded_value)
            scoped_cookie.update(cookie)
            response.cookies[scoped_name] = scoped_cookie
        patch_vary_headers(response, ("Cookie", "X-Session-Scope"))
        return response
