export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} with id ${id} not found`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class TenantIsolationError extends DomainError {
  constructor(message = "Access denied: resource belongs to another company") {
    super(message, "TENANT_ISOLATION");
    this.name = "TenantIsolationError";
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Forbidden") {
    super(message, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends DomainError {
  constructor(message = "Conflict") {
    super(message, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class ConnectorUnavailableError extends DomainError {
  constructor(message = "Connector is not available for charging") {
    super(message, "CONNECTOR_UNAVAILABLE");
    this.name = "ConnectorUnavailableError";
  }
}

export class SessionStateError extends DomainError {
  constructor(message: string) {
    super(message, "SESSION_STATE_ERROR");
    this.name = "SessionStateError";
  }
}

export class InsufficientBalanceError extends DomainError {
  constructor(message = "Insufficient wallet balance") {
    super(message, "INSUFFICIENT_BALANCE");
    this.name = "InsufficientBalanceError";
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(
    entity: string,
    from: string,
    to: string,
  ) {
    super(`Invalid ${entity} status transition: ${from} → ${to}`, "INVALID_STATE_TRANSITION");
    this.name = "InvalidStateTransitionError";
  }
}
