import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sonarjs from "eslint-plugin-sonarjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "features/events/components/**/*.tsx",
      "features/socialCampaigns/components/CampaignForm.tsx",
      "features/socialCampaigns/components/CampaignsClient.tsx",
      "app/dashboard/page.tsx",
      "app/dashboard/EventHeroCard.tsx",
      "app/dashboard/AlsoThisWeekRow.tsx",
      "app/dashboard/EventsCard.tsx",
    ],
    rules: { "react/no-multi-comp": ["error", { ignoreStateless: false }] },
  },
  {
    files: [
      "features/events/**/*.{ts,tsx}",
      "actions/events.ts",
      "app/dashboard/events/**/*.{ts,tsx}",
      "features/socialCampaigns/generation/**/*.ts",
    ],
    plugins: { sonarjs },
    rules: {
      "sonarjs/cognitive-complexity": ["error", 15],
      "no-nested-ternary": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-noninteractive-element-interactions": [
        "error",
        {
          handlers: [
            "onClick",
            "onMouseDown",
            "onMouseUp",
            "onKeyPress",
            "onKeyDown",
            "onKeyUp",
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".tmp-event-db/**",
    ".tmp-npm-cache/**",
  ]),
]);

export default eslintConfig;
