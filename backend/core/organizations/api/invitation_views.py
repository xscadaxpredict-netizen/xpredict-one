"""
The two endpoints an invited person uses, before they are anybody (C56).

MOUNTED AT /api/v1/invitations/<token>/, NOT UNDER /orgs/<slug>/, and that is
structural rather than tidy. Every view under the organisation prefix inherits
`OrgScopedAPIView`, which verifies an active membership before the handler runs
(C49) --- and the holder of an invitation link is exactly somebody with no
membership yet, so these could not live there and work. The token names the
organisation on its own, which also keeps the customer's slug out of a URL
that gets pasted into chat messages.

UNAUTHENTICATED AND THROTTLED, for the same reason signup is: there is nobody
to attribute the request to, so the IP is all there is to limit. They share
signup's scope deliberately --- an attacker with a list of guesses does not
care which unauthenticated endpoint they spend them on.
"""

from __future__ import annotations

from typing import ClassVar

from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from core.accounts.cookies import set_auth_cookies
from core.accounts.services import issue_tokens
from core.organizations.api.serializers import (
    AcceptInvitationSerializer,
    AcceptResultSerializer,
    InvitationPreviewSerializer,
)
from core.organizations.selectors import invitation_preview
from core.organizations.services import accept_invitation


class InvitationView(APIView):
    """
    Describe an invitation to whoever is holding its link.

    IT ANSWERS FOR AN EXPIRED OR SPENT INVITATION rather than refusing. "Ask
    for a new link" and "you have already accepted, sign in" are different
    sentences, and a screen that cannot tell them apart shows a dead page for
    both. Only an unknown token is 404.

    NO AUTHENTICATION CLASSES AT ALL, not `AllowAny` on top of the defaults.
    An admin checking a link while signed in should get the same answer as the
    person it was sent to --- reading it must not depend on who is asking.
    """

    authentication_classes: ClassVar[list] = []
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [ScopedRateThrottle]
    throttle_scope = "signup"

    def get(self, request: Request, token: str) -> Response:
        return Response(InvitationPreviewSerializer(invitation_preview(token)).data)


class AcceptInvitationView(APIView):
    """
    Redeem the link: create the account if there is not one, then join.

    ACCEPTING SIGNS THEM IN, through the same httpOnly cookies as login and
    signup (C12, C56). The alternative is landing somebody on the sign-in
    screen to type the password they chose ten seconds ago.

    AUTHENTICATION IS OPTIONAL, WHICH IS THE WHOLE DESIGN. A new person is
    anonymous and sends a password. Somebody whose address already has an
    account signs in first and sends nothing, because a link that could set a
    password on an existing account is a password reset with no proof of who
    is holding it. `request.user` is therefore passed through and
    `accept_invitation()` decides --- it is the only thing that can, since it
    is the only thing that knows whether the address has an account.

    NO CSRF ENFORCEMENT, for the same reason as login and signup: a first-time
    visitor holds no CSRF cookie, and requiring one would mean a round trip
    before anybody could accept. This response sets the cookie the rest of the
    session uses.
    """

    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [ScopedRateThrottle]
    throttle_scope = "signup"

    def post(self, request: Request, token: str) -> Response:
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = accept_invitation(
            token=token,
            password=serializer.validated_data.get("password") or None,
            # `getattr`, because `UNAUTHENTICATED_USER` is None in this
            # project's DRF settings -- so an anonymous `request.user` is
            # literally `None` and not Django's `AnonymousUser`. Reading
            # `.is_authenticated` off it raises, which this endpoint sees on
            # every request from somebody who is not signed in: the common
            # case, and it answered 500 until a test for an unknown token
            # caught it.
            user=getattr(request, "user", None) or None,
        )

        access, refresh = issue_tokens(result.user)

        response = Response(
            AcceptResultSerializer(
                {
                    "org_slug": result.organization.slug,
                    "account_created": result.account_created,
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )

        # The CSRF cookie the rest of the session needs. Same as signup: this
        # is the first response the browser gets that can set one.
        get_token(request)

        return set_auth_cookies(response, access, refresh)
