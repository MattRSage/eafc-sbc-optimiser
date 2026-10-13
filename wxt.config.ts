import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'SBC DOM feasibility',
    description: 'Opt-in, local-only DOM diagnostics. Live selectors are unverified.',
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; connect-src 'none'",
    },
  },
});
