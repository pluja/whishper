import type {
  ProtocolValidationError,
  ProtocolValidator,
} from "./generated/validators";

export type ProtocolParseResult<T> =
  { ok: true; value: T } | { ok: false; errors: string[] };

function describeParams({ params }: ProtocolValidationError): string {
  if (typeof params.additionalProperty === "string") {
    return `: ${params.additionalProperty}`;
  }
  if (Array.isArray(params.allowedValues)) {
    return `: ${params.allowedValues.join(", ")}`;
  }
  if ("allowedValue" in params) return `: ${String(params.allowedValue)}`;
  return "";
}

function describeError(error: ProtocolValidationError): string {
  return `${error.instancePath || "/"} ${error.message ?? error.keyword}${describeParams(error)}`;
}

export function parseProtocolMessage<T>(
  validate: ProtocolValidator<T>,
  value: unknown,
): ProtocolParseResult<T> {
  if (validate(value)) return { ok: true, value };
  return { ok: false, errors: (validate.errors ?? []).map(describeError) };
}
