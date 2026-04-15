import type {
  ChannelSummary,
  ChannelType,
  ChannelUserRole,
  ChannelUserSummary,
  CompletedTelegramAuthorization,
  TelegramConnectResult,
} from '../../application/channel-types.js';
import { HttpError } from '../errors/http-error.js';

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRequiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, 'validation_error', `${field} is required.`);
  }

  return value.trim();
};

const channelRoles = ['Admin', 'Manager', 'User'] as const;

export interface ChannelListResponse {
  channels: ChannelSummary[];
}

export interface ChannelResponse {
  channel: ChannelSummary;
}

export interface TelegramConnectRequest {
  token: string;
}

export interface TelegramConnectResponse {
  result: TelegramConnectResult;
}

export interface CompleteTelegramAuthRequest {
  telegramUserId: string;
  key: string;
}

export interface AddTelegramUserRequest extends CompleteTelegramAuthRequest {
  role: ChannelUserRole;
}

export interface TelegramAuthorizationResponse {
  result: CompletedTelegramAuthorization;
}

export interface ChannelUsersResponse {
  users: ChannelUserSummary[];
}

export interface ChannelUserResponse {
  user: ChannelUserSummary;
}

export interface UpdateChannelUserRoleRequest {
  role: ChannelUserRole;
}

export const parseChannelTypeParam = (value: unknown): ChannelType => {
  const channelType = readRequiredString(value, 'channelType');

  if (channelType !== 'telegram') {
    throw new HttpError(404, 'channel_not_found', `Channel "${channelType}" is not supported.`);
  }

  return channelType;
};

export const parseTelegramConnectRequest = (value: unknown): TelegramConnectRequest => {
  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', 'Request body must be a JSON object.');
  }

  return {
    token: readRequiredString(value.token, 'token'),
  };
};

export const parseCompleteTelegramAuthRequest = (
  value: unknown,
): CompleteTelegramAuthRequest => {
  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', 'Request body must be a JSON object.');
  }

  return {
    telegramUserId: readRequiredString(value.telegramUserId, 'telegramUserId'),
    key: readRequiredString(value.key, 'key'),
  };
};

export const parseAddTelegramUserRequest = (value: unknown): AddTelegramUserRequest => {
  const base = parseCompleteTelegramAuthRequest(value);

  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', 'Request body must be a JSON object.');
  }

  const role = readRequiredString(value.role, 'role') as ChannelUserRole;

  if (!channelRoles.includes(role)) {
    throw new HttpError(400, 'validation_error', 'role must be Admin, Manager, or User.');
  }

  return {
    ...base,
    role,
  };
};

export const parseUpdateChannelUserRoleRequest = (
  value: unknown,
): UpdateChannelUserRoleRequest => {
  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', 'Request body must be a JSON object.');
  }

  const role = readRequiredString(value.role, 'role') as ChannelUserRole;

  if (!channelRoles.includes(role)) {
    throw new HttpError(400, 'validation_error', 'role must be Admin, Manager, or User.');
  }

  return {
    role,
  };
};

export const parseChannelUserIdParam = (value: unknown): string =>
  readRequiredString(value, 'userId');

export const toChannelListResponse = (channels: ChannelSummary[]): ChannelListResponse => ({
  channels,
});

export const toChannelResponse = (channel: ChannelSummary): ChannelResponse => ({
  channel,
});

export const toTelegramConnectResponse = (
  result: TelegramConnectResult,
): TelegramConnectResponse => ({
  result,
});

export const toTelegramAuthorizationResponse = (
  result: CompletedTelegramAuthorization,
): TelegramAuthorizationResponse => ({
  result,
});

export const toChannelUsersResponse = (users: ChannelUserSummary[]): ChannelUsersResponse => ({
  users,
});

export const toChannelUserResponse = (user: ChannelUserSummary): ChannelUserResponse => ({
  user,
});
