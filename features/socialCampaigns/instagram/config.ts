/** Keep account selection consistent across publishing, refresh, and notifications. */
export function getInstagramConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = (env.VERCEL_ENV ?? env.NODE_ENV) === "production";
  const prefix = production ? "INSTAGRAM_PROD" : "INSTAGRAM_DEV";
  return {
    accountId: env[`${prefix}_ACCOUNT_ID`],
    seed: env[`${prefix}_ACCESS_TOKEN`],
    prefix,
  };
}
