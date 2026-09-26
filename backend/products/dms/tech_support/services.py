"""
Write logic for Tech Support.

Every state change goes through a function here --- never through a view, a
serializer, or another module reaching in. This module owns its models, so it
is the only place that can enforce their numbering, validation, audit and
events consistently.

Calling into other modules:

- Same product: call the other module's service function.
  `from products.dms.service.services import open_job_card` --- never
  `JobCard.objects.create(...)`.
- Different product (CRM, E-commerce): publish an event, or call a small public
  service interface. Never import another product's models.

Each public function here is one user action and runs in one transaction.
"""

from __future__ import annotations
