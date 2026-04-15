export type ChannelType = 'telegram';
export type ChannelStatus = 'disconnected' | 'connected' | 'error';
export type ChannelUserRole = 'Admin' | 'Manager' | 'User';
export type ChannelMembershipStatus = 'active' | 'revoked';

export interface ChannelSummary {
  type: ChannelType;
  label: string;
  status: ChannelStatus;
  connected: boolean;
  configured: boolean;
  lastError?: string;
  connectedAt?: string;
}

export interface TelegramConnectResult {
  channel: ChannelSummary;
  bot: {
    id: number;
    username?: string;
    displayName: string;
  };
}

export interface ChannelUserSummary {
  userId: string;
  telegramUserId: string;
  displayName: string;
  username?: string;
  role: ChannelUserRole;
  status: ChannelMembershipStatus;
  createdAt: string;
}

export interface PendingTelegramRegistration {
  telegramUserId: string;
  displayName: string;
  username?: string;
  key: string;
  linked: boolean;
}

export interface CompletedTelegramAuthorization {
  user: ChannelUserSummary;
  autoAssignedAdmin: boolean;
}
