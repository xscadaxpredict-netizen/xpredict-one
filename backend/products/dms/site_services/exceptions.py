from shared.exceptions import NotFoundError, InvalidInputError, ConflictError


def not_found(resource: str) -> NotFoundError:
    return NotFoundError(code="not_found", message=f"{resource} not found.")


def validation_error(msg: str) -> InvalidInputError:
    return InvalidInputError(code="validation_error", message=msg)


def conflict_error(msg: str) -> ConflictError:
    return ConflictError(code="conflict", message=msg)
