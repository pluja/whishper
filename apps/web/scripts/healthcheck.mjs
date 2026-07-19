const target = process.argv[2] ?? "http://localhost:3000/api/health";

try {
  const response = await fetch(target, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) process.exit(1);
} catch {
  process.exit(1);
}
