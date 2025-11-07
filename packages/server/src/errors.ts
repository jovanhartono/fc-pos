import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "http-status-codes";

export class NotFoundException extends HTTPException {
  constructor(message = "Not Found") {
    super(StatusCodes.NOT_FOUND, { message });
  }
}

export class UnauthorizedException extends HTTPException {
  constructor(message = "Unauthorized") {
    super(StatusCodes.UNAUTHORIZED, { message });
  }
}

export class ForbiddenException extends HTTPException {
  constructor(message = "Forbidden") {
    super(StatusCodes.FORBIDDEN, { message });
  }
}

export class BadRequestException extends HTTPException {
  constructor(message = "Bad Request") {
    super(StatusCodes.BAD_REQUEST, { message });
  }
}

export class ConflictException extends HTTPException {
  constructor(message = "Conflict") {
    super(StatusCodes.CONFLICT, { message });
  }
}
