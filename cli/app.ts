import type {
  ModelConfig,
  Message,
  ProviderDefinition,
  ProviderSummary,
  RegisteredProvider,
} from '../ai-provider/src/index.js';
import type { ProviderManagerClientContract } from './server-provider-manager-client.js';

import { CliPrompter } from './prompt.js';

const menuItems = [
  'Register provider',
  'Show registered providers',
  'Select active provider',
  'Show provider models',
  'Sandbox chat',
  'Exit',
] as const;

const SANDBOX_STATUS_INTERVAL_MS = 1_000;

const printDivider = (): void => {
  console.log('\n----------------------------------------');
};

const formatStatus = (healthy: boolean): string => (healthy ? 'OK' : 'ERROR');

const formatCapabilities = (model: ModelConfig): string => {
  const flags = [
    model.capabilities.supportsStreaming ? 'stream' : undefined,
    model.capabilities.supportsTools ? 'tools' : undefined,
    model.capabilities.supportsJsonMode ? 'json' : undefined,
    model.capabilities.supportsVision ? 'vision' : undefined,
    model.capabilities.supportsSystemPrompt ? 'system' : undefined,
  ].filter((value): value is string => Boolean(value));

  return flags.length > 0 ? flags.join(', ') : 'n/a';
};

const formatProviderSummary = (provider: ProviderSummary): string =>
  `${provider.name} (${provider.providerId}) | ${provider.baseUrl} | selected: ${provider.selected ? 'yes' : 'no'} | status: ${formatStatus(provider.healthy)} | models: ${provider.modelCount}`;

const formatRegisteredProvider = (provider: RegisteredProvider): string =>
  `${provider.config.name} (${provider.config.id}) | ${provider.config.baseUrl} | status: ${provider.connection.ok ? 'OK' : provider.connection.message}`;

const renderMessageContent = (content: Message['content']): string => {
  if (typeof content === 'string') {
    return content.trim();
  }

  return content
    .filter((part): part is Extract<Message['content'][number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text.trim())
    .filter((part) => part.length > 0)
    .join('\n');
};

const createStatusRenderer = (label: string): (() => void) => {
  const startedAt = Date.now();

  const render = (): string =>
    `${label} (${Math.max(1, Math.floor((Date.now() - startedAt) / 1000))}s)`;

  process.stdout.write(`${render()}\r`);

  const timer = setInterval(() => {
    process.stdout.write(`${render()}\r`);
  }, SANDBOX_STATUS_INTERVAL_MS);

  return (): void => {
    clearInterval(timer);
    process.stdout.write(' '.repeat(render().length));
    process.stdout.write('\r');
  };
};

export class CliApplication {
  readonly #providerManager: ProviderManagerClientContract;
  readonly #prompter: CliPrompter;

  constructor(providerManager: ProviderManagerClientContract, prompter = new CliPrompter()) {
    this.#providerManager = providerManager;
    this.#prompter = prompter;
  }

  async run(): Promise<void> {
    console.log('AI Manager CLI');
    console.log('Interactive provider and model management.\n');

    try {
      await this.#ensureServerAvailability();

      let shouldExit = false;

      while (!shouldExit) {
        printDivider();
        const selectedAction = await this.#prompter.choose(
          'Main menu',
          menuItems,
          (item) => item,
        );

        switch (selectedAction) {
          case 'Register provider':
            await this.#runAction(() => this.#registerProvider());
            break;
          case 'Show registered providers':
            await this.#runAction(() => this.#showRegisteredProviders());
            break;
          case 'Select active provider':
            await this.#runAction(() => this.#selectActiveProvider());
            break;
          case 'Show provider models':
            await this.#runAction(() => this.#showProviderModels());
            break;
          case 'Sandbox chat':
            await this.#runAction(() => this.#runSandboxChat());
            break;
          case 'Exit':
            shouldExit = true;
            break;
        }
      }
    } finally {
      this.#prompter.close();
    }

    console.log('\nCLI finished.');
  }

  async #runAction(action: () => Promise<void>): Promise<void> {
    try {
      printDivider();
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      console.error(`Error: ${message}`);
    }
  }

  async #ensureServerAvailability(): Promise<void> {
    process.stdout.write('Checking server availability... ');
    await this.#providerManager.checkServerAvailability();
    console.log('OK');
  }

  async #registerProvider(): Promise<void> {
    const definitions = await this.#providerManager.listSupportedProviders();
    const selectedProvider = await this.#prompter.choose(
      'Choose a provider to register',
      definitions,
      (provider) => this.#formatProviderDefinition(provider),
    );

    const baseUrl =
      (await this.#prompter.askOptional('Base URL', selectedProvider.defaultBaseUrl)) ??
      selectedProvider.defaultBaseUrl;
    const timeoutValue = await this.#prompter.askOptional('Timeout (ms)', '120000');
    const defaultModelId = await this.#prompter.askOptional('Default model ID (optional)');
    const timeoutMs = this.#parseTimeout(timeoutValue);

    const registeredProvider = await this.#providerManager.saveProvider(selectedProvider.id, {
      baseUrl,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(defaultModelId ? { defaultModelId } : {}),
    });

    console.log(`Provider ${registeredProvider.config.name} saved.`);
    console.log(`Base URL: ${registeredProvider.config.baseUrl}`);
    console.log(
      `Status: ${registeredProvider.connection.ok ? 'connection available' : registeredProvider.connection.message}`,
    );
    console.log(`Models found: ${registeredProvider.models.length}`);
  }

  async #showRegisteredProviders(): Promise<void> {
    const providers = await this.#providerManager.listProviders();

    if (providers.length === 0) {
      console.log('There are no registered providers yet.');
      return;
    }

    console.log('Registered providers:');

    providers.forEach((provider, index) => {
      console.log(`  ${index + 1}. ${formatProviderSummary(provider)}`);
    });
  }

  async #selectActiveProvider(): Promise<void> {
    const providers = await this.#providerManager.listProviders();

    if (providers.length === 0) {
      console.log('Register at least one provider first.');
      return;
    }

    const selectedProvider = await this.#prompter.choose(
      'Choose the active provider',
      providers,
      (provider) => formatProviderSummary(provider),
    );
    const savedProvider = await this.#providerManager.setSelectedProvider(selectedProvider.providerId);

    console.log(`Active provider: ${savedProvider.config.name} (${savedProvider.config.id}).`);
  }

  async #showProviderModels(): Promise<void> {
    const providers = await this.#providerManager.listProviders();

    if (providers.length === 0) {
      console.log('There are no registered providers. Register one first.');
      return;
    }

    const currentProvider = await this.#providerManager.getCurrentProvider();
    const provider = await this.#chooseProviderForModels(providers, currentProvider);
    const modelResult = await this.#providerManager.getProviderModels(provider.providerId);

    if (modelResult.models.length === 0) {
      console.log(`Provider ${provider.name} does not have any available models yet.`);
      return;
    }

    console.log(`Models for provider ${provider.name}:`);

    modelResult.models.forEach((model, index) => {
      console.log(
        `  ${index + 1}. ${model.label} | id: ${model.id} | context: ${model.contextWindow} | capabilities: ${formatCapabilities(model)}`,
      );
    });
  }

  async #chooseProviderForModels(
    providers: ProviderSummary[],
    currentProvider?: RegisteredProvider,
  ): Promise<ProviderSummary> {
    if (currentProvider) {
      const useCurrentProvider = await this.#prompter.choose(
        'Which provider should be used to show models?',
        ['Use active provider', 'Choose another registered provider'] as const,
        (option) =>
          option === 'Use active provider'
            ? `${option}: ${formatRegisteredProvider(currentProvider)}`
            : option,
      );

      if (useCurrentProvider === 'Use active provider') {
        const activeSummary = providers.find((provider) => provider.providerId === currentProvider.config.id);

        if (activeSummary) {
          return activeSummary;
        }
      }
    }

    return this.#prompter.choose(
      'Choose a provider',
      providers,
      (provider) => formatProviderSummary(provider),
    );
  }

  #formatProviderDefinition(provider: ProviderDefinition): string {
    return `${provider.name} (${provider.id}) | ${provider.description} | default: ${provider.defaultBaseUrl}`;
  }

  #parseTimeout(rawValue?: string): number | undefined {
    if (!rawValue) {
      return undefined;
    }

    const parsed = Number.parseInt(rawValue, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('Timeout must be a positive integer.');
    }

    return parsed;
  }

  async #runSandboxChat(): Promise<void> {
    await this.#ensureServerAvailability();

    const currentProvider = await this.#providerManager.getCurrentProvider();

    if (!currentProvider) {
      console.log('Select an active provider before starting sandbox chat.');
      return;
    }

    const modelResult = await this.#providerManager.getProviderModels(currentProvider.config.id);

    if (modelResult.models.length === 0) {
      console.log(`Provider ${currentProvider.config.name} does not have any available models.`);
      return;
    }

    const selectedModel = await this.#chooseSandboxModel(currentProvider, modelResult.models);
    const history: Message[] = [];

    console.log(`Sandbox chat is ready with ${currentProvider.config.name} / ${selectedModel.label}.`);
    console.log('Type your message and press Enter. Use /exit or /quit to leave the sandbox chat.');

    while (true) {
      const userInput = await this.#prompter.askRequired('You');

      if (this.#isChatExitCommand(userInput)) {
        console.log('Sandbox chat closed.');
        return;
      }

      history.push({
        role: 'user',
        content: userInput,
      });

      const stopStatus = createStatusRenderer('Assistant is thinking...');

      try {
        const response = await this.#providerManager.sandboxChat({
          providerId: currentProvider.config.id,
          modelId: selectedModel.id,
          messages: history,
        });

        history.push(response.message);

        const assistantText = renderMessageContent(response.message.content);

        stopStatus();
        console.log(
          `Assistant${assistantText.length > 0 ? '' : ' (empty response)'}: ${assistantText || '[empty response]'}`,
        );
      } catch (error) {
        stopStatus();
        history.pop();

        const message = error instanceof Error ? error.message : 'Unknown sandbox chat error.';
        console.error(`Assistant request failed: ${message}`);
        console.log('You can try another message or use /exit to leave the sandbox chat.');
      }
    }
  }

  async #chooseSandboxModel(
    provider: RegisteredProvider,
    models: ModelConfig[],
  ): Promise<ModelConfig> {
    const defaultModel =
      (provider.config.defaultModelId
        ? models.find((model) => model.id === provider.config.defaultModelId)
        : undefined) ?? models[0];

    if (!defaultModel) {
      throw new Error(`Provider "${provider.config.name}" does not have any models.`);
    }

    const selectionMode = await this.#prompter.choose(
      'Choose a model for sandbox chat',
      ['Use suggested model', 'Choose another model'] as const,
      (option) =>
        option === 'Use suggested model'
          ? `${option}: ${defaultModel.label} (${defaultModel.id})`
          : option,
    );

    if (selectionMode === 'Use suggested model') {
      return defaultModel;
    }

    return this.#prompter.choose(
      `Available models for ${provider.config.name}`,
      models,
      (model) => `${model.label} | id: ${model.id} | capabilities: ${formatCapabilities(model)}`,
    );
  }

  #isChatExitCommand(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === '/exit' || normalized === '/quit';
  }
}
