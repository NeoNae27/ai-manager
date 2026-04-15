import { Router } from 'express';
import type { ProviderApiService } from '../../application/provider-api-service.js';
import {
  parseCreateProviderRequest,
  parseProviderIdParam,
  parseProviderOperationOptionsRequest,
  toCurrentProviderResponse,
  toPingProviderResponse,
  toProviderDefinitionsResponse,
  toProviderListResponse,
  toProviderModelsResponse,
  toProviderResponse,
} from '../dto/providers.js';

export const createProviderRouter = (providerApiService: ProviderApiService): Router => {
  const router = Router();

  router.get('/definitions', async (_request, response) => {
    const providers = providerApiService.listDefinitions();
    response.json(toProviderDefinitionsResponse(providers));
  });

  router.get('/', async (_request, response) => {
    const providers = await providerApiService.listProviders();
    response.json(toProviderListResponse(providers));
  });

  router.get('/current', async (_request, response) => {
    const provider = await providerApiService.getCurrentProvider();
    response.json(toCurrentProviderResponse(provider));
  });

  router.post('/', async (request, response) => {
    const body = parseCreateProviderRequest(request.body);
    const provider = await providerApiService.createProvider(body);
    response.status(201).json(toProviderResponse(provider));
  });

  router.post('/:providerId/ping', async (request, response) => {
    const providerId = parseProviderIdParam(request.params.providerId);
    const options = parseProviderOperationOptionsRequest(request.body);
    const result = await providerApiService.pingProvider(providerId, options);

    response.json(toPingProviderResponse(result));
  });

  router.get('/:providerId/models', async (request, response) => {
    const providerId = parseProviderIdParam(request.params.providerId);
    const result = await providerApiService.getProviderModels(providerId);

    response.json(toProviderModelsResponse(result));
  });

  router.post('/:providerId/select', async (request, response) => {
    const providerId = parseProviderIdParam(request.params.providerId);
    const provider = await providerApiService.selectProvider(providerId);

    response.json(toProviderResponse(provider));
  });

  return router;
};
