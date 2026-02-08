---
layout: home
hero:
  name: discord-cluster
  text: Transparent Cross-Cluster Operations
  tagline: No more broadcastEval. Cache first, REST fallback, type-safe IPC.
  image:
    src: /logo.svg
    alt: discord-cluster
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/LucasCzechia/discord-cluster
features:
  - icon:
      src: /icons/transparent.svg
    title: Transparent API
    details: cluster.guilds.fetch(), cluster.channels.send(), cluster.members.fetch() work across clusters automatically. Cache first, IPC routing, REST fallback.
  - icon:
      src: /icons/ipc.svg
    title: Type-Safe IPC
    details: Named request/response handlers with full TypeScript types. No eval, no string serialization, no broadcastEval.
  - icon:
      src: /icons/guard.svg
    title: Process Guard
    details: Orphan detection, stale process cleanup, graceful shutdown with cleanup tasks. No more zombie processes.
  - icon:
      src: /icons/restart.svg
    title: Rolling Restarts
    details: Zero-downtime deploys with manager.rollingRestart(). Clusters restart one-by-one while others keep serving.
  - icon:
      src: /icons/store.svg
    title: Shared Store
    details: Cross-cluster key-value store with TTL support. Manager holds the data, clusters read/write via IPC.
  - icon:
      src: /icons/events.svg
    title: Cross-Cluster Events
    details: Pub/sub event system between clusters. Broadcast to all, target specific clusters, or wait for acknowledgments.
---
