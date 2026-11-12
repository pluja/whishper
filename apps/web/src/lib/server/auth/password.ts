import { revokeAllApiTokens } from "#lib/server/auth/api-tokens.ts";
import { auth } from "#lib/server/auth/auth.ts";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "#lib/shared/limits.ts";

export function passwordLengthProblem(password: string): string | null {
  if (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  ) {
    return null;
  }
  return `Use between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters for your password.`;
}

export async function isCurrentPassword(
  userId: string,
  password: string,
): Promise<boolean> {
  const context = await auth.$context;
  const account = await context.internalAdapter.findCredentialAccount(userId);
  if (!account?.password) return false;
  return context.password.verify({ hash: account.password, password });
}

// Signs the account out everywhere and revokes its API tokens, so whoever
// knew the old password loses all access.
export async function resetPassword(
  email: string,
  newPassword: string,
): Promise<boolean> {
  const context = await auth.$context;
  const found = await context.internalAdapter.findUserByEmail(email, {
    includeAccounts: true,
  });
  if (!found?.accounts.some((account) => account.providerId === "credential")) {
    return false;
  }
  await context.internalAdapter.updatePassword(
    found.user.id,
    await context.password.hash(newPassword),
  );
  await context.internalAdapter.deleteUserSessions(found.user.id);
  revokeAllApiTokens(found.user.id);
  return true;
}
