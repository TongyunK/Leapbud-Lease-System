/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

import 'axios'

declare module 'axios' {
  export interface AxiosRequestConfig {
    silentError?: boolean
  }
}
