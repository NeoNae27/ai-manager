import type { ModelConfig } from './model.js';

export const supportsStreaming = (model: ModelConfig): boolean => model.capabilities.supportsStreaming;

export const supportsTools = (model: ModelConfig): boolean => model.capabilities.supportsTools;

export const supportsJsonMode = (model: ModelConfig): boolean => model.capabilities.supportsJsonMode;
