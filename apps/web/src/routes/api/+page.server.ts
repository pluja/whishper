import { modelsForApi } from "#lib/server/api/models.ts";
import { apiReference } from "#lib/server/api/reference.ts";
import { requireUserOrLogin } from "#lib/server/auth/session.ts";
import { version } from "../../../package.json";
import type { PageServerLoad } from "./$types";

const MODEL_PLACEHOLDER = "MODEL_ID_FROM_GET_MODELS";

export const load: PageServerLoad = ({ locals, url }) => {
  requireUserOrLogin(locals);
  const exampleModel =
    modelsForApi().find((model) => model.isDefault)?.id ?? MODEL_PLACEHOLDER;
  return {
    reference: apiReference(version, url.origin, exampleModel),
    origin: url.origin,
  };
};
