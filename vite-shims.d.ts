declare module '@vitejs/plugin-react' {
  import type { PluginOption } from 'vite'
  export default function react(): PluginOption
}

declare module 'vite-plugin-pwa' {
  import type { PluginOption } from 'vite'
  export function VitePWA(options?: unknown): PluginOption
}
