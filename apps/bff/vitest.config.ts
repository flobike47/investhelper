import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // config.ts exige ces variables au chargement — valeurs factices,
    // aucun test ne doit joindre un vrai service.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SUPABASE_URL: 'http://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
      GEMINI_API_KEY: 'test-gemini-key',
    },
    restoreMocks: true,
  },
});
