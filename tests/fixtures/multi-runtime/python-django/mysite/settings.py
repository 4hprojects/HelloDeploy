import os

# Acceptance fixture only: a real project reads its key from a HelloDeploy secret.
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "acceptance-fixture-not-a-secret")
DEBUG = False
ALLOWED_HOSTS = ["*"]
ROOT_URLCONF = "mysite.urls"
INSTALLED_APPS = []
MIDDLEWARE = []
DATABASES = {}
USE_TZ = True
