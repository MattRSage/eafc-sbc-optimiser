import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'SBC inventory companion',
    permissions: ['scripting'],
    host_permissions: ['https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*'],
    description: 'User-started, local-only inventory import and DOM observations. Live ownership remains unverified.',
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; connect-src 'none'",
    },
  },
});
