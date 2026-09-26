from django.apps import AppConfig


class ServiceConfig(AppConfig):
    """Appointments, job cards, parts used, service history."""

    name = "products.dms.service"
    # Unique across the whole project. Django app labels are global, so every
    # module is prefixed with its product --- "sales" alone would collide the
    # moment another product grows a sales module.
    label = "dms_service"
