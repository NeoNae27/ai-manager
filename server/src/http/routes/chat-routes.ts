import { Router } from 'express';
import type { ChatApiService } from '../../application/chat-api-service.js';
import { parseSandboxChatRequest, toSandboxChatResponse } from '../dto/chat.js';

export const createChatRouter = (chatApiService: ChatApiService): Router => {
  const router = Router();

  router.post('/sandbox', async (request, response) => {
    const body = parseSandboxChatRequest(request.body);
    const result = await chatApiService.sandboxChat(body);

    response.json(toSandboxChatResponse(result));
  });

  return router;
};
