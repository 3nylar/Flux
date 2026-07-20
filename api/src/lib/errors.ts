export type ApiErrorCode =
  // 400
  | "invalid_request"
  | "validation_failed"
  // 401 / 403
  | "authentication_required"
  | "invalid_api_key"
  | "insufficient_permissions"
  // 404
  | "resource_not_found"
  // 409
  | "idempotency_conflict"
  | "session_not_running"
  | "session_already_stopped"
  // 422
  | "receiver_keysend_disabled"
  | "insufficient_wallet_balance"
  | "rate_too_low"
  // 429
  | "rate_limit_exceeded"
  // 500 / 502
  | "internal_error"
  | "lightning_node_unavailable"
  | "payment_failed";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Array<{ field: string; issue: string }>;
    request_id?: string;
    docs_url?: string;
  };
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details?: Array<{ field: string; issue: string }>;
  public readonly docsUrl?: string;

  constructor(params: {
    statusCode: number;
    code: ApiErrorCode;
    message: string;
    details?: Array<{ field: string; issue: string }>;
    docsUrl?: string;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.details = params.details;
    this.docsUrl = params.docsUrl;
  }

  toBody(requestId?: string): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
        ...(requestId ? { request_id: requestId } : {}),
        ...(this.docsUrl ? { docs_url: this.docsUrl } : {}),
      },
    };
  }

  static badRequest(message: string, code: ApiErrorCode = "invalid_request") {
    return new ApiError({ statusCode: 400, code, message });
  }

  static validation(details: Array<{ field: string; issue: string }>) {
    return new ApiError({
      statusCode: 400,
      code: "validation_failed",
      message: "One or more fields failed validation.",
      details,
    });
  }

  static unauthorized(message = "A valid API key is required.") {
    return new ApiError({ statusCode: 401, code: "authentication_required", message });
  }

  static invalidApiKey() {
    return new ApiError({
      statusCode: 401,
      code: "invalid_api_key",
      message: "The provided API key is invalid, revoked, or malformed.",
    });
  }

  static forbidden(message = "This API key lacks permission for that action.") {
    return new ApiError({ statusCode: 403, code: "insufficient_permissions", message });
  }

  static notFound(resource: string) {
    return new ApiError({ statusCode: 404, code: "resource_not_found", message: `No such ${resource}.` });
  }

  static conflict(code: ApiErrorCode, message: string) {
    return new ApiError({ statusCode: 409, code, message });
  }

  static unprocessable(code: ApiErrorCode, message: string) {
    return new ApiError({ statusCode: 422, code, message });
  }

  static internal(message = "An unexpected error occurred on our side.") {
    return new ApiError({ statusCode: 500, code: "internal_error", message });
  }

  static nodeUnavailable(message = "The Lightning node is unreachable. Please retry shortly.") {
    return new ApiError({ statusCode: 502, code: "lightning_node_unavailable", message });
  }
}
