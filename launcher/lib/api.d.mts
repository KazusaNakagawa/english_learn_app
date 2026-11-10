// Types for web/vite.config.ts, which mounts this handler on the dev server.
import type { IncomingMessage, ServerResponse } from "node:http"

export declare const MODELS: readonly string[]
export declare const DEFAULT_MODEL: string

/** Handles /api/* and returns true; returns false for every other path. */
export type ApiHandler = (req: IncomingMessage, res: ServerResponse) => boolean

export declare function createApiHandler(options?: { version?: string }): ApiHandler
