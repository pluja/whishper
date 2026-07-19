import { auth } from "$lib/server/auth";
import { pool } from "$lib/server/db";
import { fail, redirect, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const initialized = await pool.query(
    "select exists(select 1 from auth_users) as value",
  );
  if (initialized.rows[0].value) redirect(303, "/login");
  return {};
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");

    if (name.length < 2)
      return fail(400, {
        message: "Use at least two characters for your name.",
      });
    if (!email.includes("@"))
      return fail(400, { message: "Enter a valid email address." });
    if (password.length < 10) {
      return fail(400, {
        message: "Use at least ten characters for your password.",
      });
    }

    const initialized = await pool.query(
      "select exists(select 1 from auth_users) as value",
    );
    if (initialized.rows[0].value) redirect(303, "/login");

    try {
      const created = await auth.api.signUpEmail({
        body: { name, email, password },
        headers: request.headers,
      });
      const workspaceName = `${name}'s workspace`;
      const slug = `workspace-${created.user.id
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 24)}`;
      const client = await pool.connect();
      try {
        await client.query("begin");
        const workspace = await client.query<{ id: string }>(
          "insert into workspaces (name, slug) values ($1, $2) returning id",
          [workspaceName, slug],
        );
        await client.query(
          `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')`,
          [workspace.rows[0].id, created.user.id],
        );
        await client.query("commit");
      } catch (cause) {
        await client.query("rollback");
        throw cause;
      } finally {
        client.release();
      }
      redirect(303, "/");
    } catch (cause) {
      if (cause && typeof cause === "object" && "status" in cause) throw cause;
      console.error("Owner setup failed", cause);
      return fail(400, {
        message:
          "The owner account could not be created. Check the details and try again.",
      });
    }
  },
};
