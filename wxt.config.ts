import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'SBC DOM feasibility',
    description: 'Opt-in, local-only player-list DOM observations. Owned-card identity is unverified.',
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; connect-src 'none'",
    },
  },
});
