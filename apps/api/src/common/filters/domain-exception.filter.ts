import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import {
  DomainError,
  NotFoundError,
  ValidationError,
  TenantIsolationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from "@evcharge/domain";

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      response.status(status).json(
        typeof res === "string"
          ? { code: "HTTP_ERROR", message: res }
          : res,
      );
      return;
    }

    if (exception instanceof NotFoundError) {
      response.status(HttpStatus.NOT_FOUND).json({
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof ValidationError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof UnauthorizedError) {
      response.status(HttpStatus.UNAUTHORIZED).json({
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof ForbiddenError || exception instanceof TenantIsolationError) {
      response.status(HttpStatus.FORBIDDEN).json({
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof ConflictError) {
      response.status(HttpStatus.CONFLICT).json({
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof DomainError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
  }
}
