import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'discord-cluster',
  description: 'Transparent cross-cluster operations for discord.js',
  base: '/',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/cluster-client' },
      { text: 'npm', link: 'https://www.npmjs.com/package/discord-cluster' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
          ]
        },
        {
          text: 'Features',
          items: [
            { text: 'Transparent API', link: '/guide/transparent-api' },
            { text: 'IPC Handlers', link: '/guide/ipc' },
            { text: 'Shared Store', link: '/guide/store' },
            { text: 'Cross-Cluster Events', link: '/guide/events' },
            { text: 'Process Guard', link: '/guide/process-guard' },
            { text: 'Rolling Restart', link: '/guide/rolling-restart' },
            { text: 'Logging', link: '/guide/logging' },
          ]
        },
      ],
      '/api/': [
        {
          text: 'Core',
          items: [
            { text: 'ClusterManager', link: '/api/cluster-manager' },
            { text: 'ClusterClient', link: '/api/cluster-client' },
          ]
        },
        {
          text: 'Managers',
          items: [
            { text: 'GuildManager', link: '/api/guild-manager' },
            { text: 'ChannelManager', link: '/api/channel-manager' },
            { text: 'MemberManager', link: '/api/member-manager' },
            { text: 'UserManager', link: '/api/user-manager' },
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'Types', link: '/api/types' },
          ]
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/LucasCzechia/discord-cluster' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 LucasCzechia',
    },
    search: {
      provider: 'local',
    },
  },
})
