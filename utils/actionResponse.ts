import { ResponseCodes } from "@/app/enums/responseCodes";

export function ok<T>(data: T, statusText = "OK") {
  return { error: "" as const, status: ResponseCodes.SUCCESS, statusText, data };
}

export function fail(message: string, statusText?: string) {
  return {
    error: message,
    status: ResponseCodes.SERVER_ERROR,
    statusText: statusText ?? message,
    data: null,
  };
}

export function clientFail(message: string, statusText?: string) {
  return {
    error: message,
    status: ResponseCodes.CLIENT_ERROR,
    statusText: statusText ?? message,
    data: null,
  };
}
