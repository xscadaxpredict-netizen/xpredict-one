from django.apps import AppConfig


class TechSupportConfig(AppConfig):
    """Support tickets, call requests, technical documentation."""

    name = "products.dms.tech_support"
    # Unique across the whole project. Django app labels are global, so every
    # module is prefixed with its product --- "sales" alone would collide the
    # moment another product grows a sales module.
    label = "dms_tech_support"
