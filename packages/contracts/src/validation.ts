import type { ProtocolValidator } from "./generated/validators";

export type ProtocolParseResult<T> =
  { ok: true; value: T } | { ok: false; errors: string[] };

export function parseProtocolMessage<T>(
  validate: ProtocolValidator<T>,
  value: unknown,
): ProtocolParseResult<T> {
  if (validate(value)) return { ok: true, value };
  return {
    ok: false,
    errors: (validate.errors ?? []).map(
      (error) =>
        `${error.instancePath || "/"} ${error.message ?? error.keyword}`,
    ),
  };
}
