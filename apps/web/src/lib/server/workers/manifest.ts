import {
  parseProtocolMessage,
  validateWorkerManifest,
  type WorkerManifest,
} from "@anysub/contracts";

export function parseWorkerManifest(value: unknown): WorkerManifest {
  const parsed = parseProtocolMessage(validateWorkerManifest, value);
  if (!parsed.ok) {
    throw new Error(`Invalid worker manifest: ${parsed.errors.join("; ")}`);
  }
  const memory = parsed.value.hardware?.memory;
  if (memory && memory.availableBytes > memory.totalBytes) {
    throw new Error("Worker hardware inventory is invalid");
  }
  return parsed.value;
}
