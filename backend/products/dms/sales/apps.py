from django.apps import AppConfig


class SalesConfig(AppConfig):
    """Enquiries, quotations, orders --- the dealer's selling pipeline."""

    name = "products.dms.sales"
    # Unique across the whole project. Django app labels are global, so every
    # module is prefixed with its product --- "sales" alone would collide the
    # moment another product grows a sales module.
    label = "dms_sales"
