from django.http import HttpResponse, JsonResponse
from django.urls import path

urlpatterns = [
    path("", lambda request: HttpResponse("django-ok")),
    path("acceptance", lambda request: JsonResponse({"fixture": "python-django", "ok": True})),
]
