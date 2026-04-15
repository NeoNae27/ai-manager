import { Router } from 'express';
import type { ChannelApiService } from '../../application/channel-api-service.js';
import {
  parseAddTelegramUserRequest,
  parseChannelTypeParam,
  parseChannelUserIdParam,
  parseCompleteTelegramAuthRequest,
  parseTelegramConnectRequest,
  parseUpdateChannelUserRoleRequest,
  toChannelListResponse,
  toChannelResponse,
  toChannelUserResponse,
  toChannelUsersResponse,
  toTelegramAuthorizationResponse,
  toTelegramConnectResponse,
} from '../dto/channels.js';

export const createChannelRouter = (channelApiService: ChannelApiService): Router => {
  const router = Router();

  router.get('/', async (_request, response) => {
    response.json(toChannelListResponse(channelApiService.listChannels()));
  });

  router.get('/:channelType/status', async (request, response) => {
    const channelType = parseChannelTypeParam(request.params.channelType);
    response.json(toChannelResponse(channelApiService.getChannelStatus(channelType)));
  });

  router.post('/telegram/connect', async (request, response) => {
    const body = parseTelegramConnectRequest(request.body);
    const result = await channelApiService.connectTelegram(body.token);

    response.status(201).json(toTelegramConnectResponse(result));
  });

  router.post('/telegram/complete-auth', async (request, response) => {
    const body = parseCompleteTelegramAuthRequest(request.body);
    const result = channelApiService.completeTelegramAuth(body.telegramUserId, body.key);

    response.json(toTelegramAuthorizationResponse(result));
  });

  router.post('/telegram/add-user', async (request, response) => {
    const body = parseAddTelegramUserRequest(request.body);
    const result = channelApiService.addTelegramUser(body.telegramUserId, body.key, body.role);

    response.status(201).json(toTelegramAuthorizationResponse(result));
  });

  router.get('/telegram/users', async (_request, response) => {
    response.json(toChannelUsersResponse(channelApiService.listTelegramUsers()));
  });

  router.post('/telegram/users/:userId/role', async (request, response) => {
    const userId = parseChannelUserIdParam(request.params.userId);
    const body = parseUpdateChannelUserRoleRequest(request.body);
    const result = channelApiService.updateTelegramUserRole(userId, body.role);

    response.json(toChannelUserResponse(result));
  });

  router.delete('/telegram/users/:userId', async (request, response) => {
    const userId = parseChannelUserIdParam(request.params.userId);
    const result = channelApiService.removeTelegramUser(userId);

    response.json(toChannelUserResponse(result));
  });

  router.post('/telegram/disconnect', async (_request, response) => {
    response.json(toChannelResponse(channelApiService.disconnectTelegram()));
  });

  router.post('/telegram/recheck', async (_request, response) => {
    response.json(toChannelResponse(await channelApiService.recheckTelegram()));
  });

  return router;
};
