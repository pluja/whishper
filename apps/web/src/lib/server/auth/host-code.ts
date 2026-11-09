import { randomInt, timingSafeEqual } from "node:crypto";

// Codes are read from a log and typed by hand, so the alphabet leaves out
// characters that look alike: 0 and O, 1, I and L.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUP_COUNT = 3;
const GROUP_LENGTH = 4;

export function generateHostCode(): string {
  const groups: string[] = [];
  for (let group = 0; group < GROUP_COUNT; group += 1) {
    let characters = "";
    for (let index = 0; index < GROUP_LENGTH; index += 1) {
      characters += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(characters);
  }
  return groups.join("-");
}

function normalize(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hostCodesMatch(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(normalize(expected));
  const providedBytes = Buffer.from(normalize(provided));
  return (
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}
