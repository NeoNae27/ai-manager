import type {
  ModelConfig,
  Message,
  ProviderDefinition,
  ProviderSummary,
  RegisteredProvider,
} from '../ai-provider/src/index.js';
import type { ProviderManagerClientContract } from './server-provider-manager-client.js';

import { CliPrompter } from './prompt.js';
import { badge, boxed, color, hero, icon, kv, modelCard, providerCard, sectionTitle, separator } from './theme.js';

const menuItems = [
  'Register provider',
  'Show registered providers',
  'Select active provider',
  'Show provider models',
  'Sandbox chat',
  'Exit',
] as const;

const menuHints: Record<(typeof menuItems)[number], string> = {
  'Register provider': 'Connect Ollama or LM Studio',
  'Show registered providers': 'See saved endpoints and status',
  'Select active provider': 'Choose the default provider',
  'Show provider models': 'Browse available model catalog',
  'Sandbox chat': 'Try a quick prompt in the terminal',
  Exit: 'Close the CLI',
};

const SANDBOX_STATUS_INTERVAL_MS = 1_000;

const printDivider = (): void => console.log(`\n${separator()}`);
const clearScreen = (): void => console.clear();

const formatStatus = (healthy: boolean): string => (healthy ? 'online' : 'offline');

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
  `${provider.name} (${provider.providerId}) · ${formatStatus(provider.healthy)} · ${provider.modelCount} models`;

const formatRegisteredProvider = (provider: RegisteredProvider): string =>
  `${provider.config.name} (${provider.config.id}) · ${provider.config.baseUrl} · ${provider.connection.ok ? 'online' : provider.connection.message}`;

const formatProviderDefinitionCompact = (provider: ProviderDefinition): string =>
  `${provider.name} (${provider.id})`;

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
    `${color.primary(label)} ${color.muted(`(${Math.max(1, Math.floor((Date.now() - startedAt) / 1000))}s)`)}`;

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
    try {
      await this.#ensureServerAvailability();

      let shouldExit = false;

      while (!shouldExit) {
        await this.#renderHomeScreen();
        const selectedAction = await this.#prompter.choose(
          'Main menu',
          menuItems,
          (item) => `${item} ${color.muted(`· ${menuHints[item]}`)}`,
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

    console.log(`\n${color.muted('CLI finished.')}`);
  }

  async #runAction(action: () => Promise<void>): Promise<void> {
    try {
      printDivider();
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      console.error(boxed('Action failed', [message], 'warning'));
    } finally {
      await this.#prompter.pause(color.muted('Press Enter to return to the main menu'));
    }
  }

  async #ensureServerAvailability(): Promise<void> {
    process.stdout.write(`${color.muted('Checking server availability')}... `);
    await this.#providerManager.checkServerAvailability();
    console.log(badge.status(true));
  }

  async #renderHomeScreen(): Promise<void> {
    clearScreen();

    const [providers, currentProvider] = await Promise.all([
      this.#providerManager.listProviders(),
      this.#providerManager.getCurrentProvider(),
    ]);
    const onlineProviders = providers.filter((provider) => provider.healthy).length;
    const selectedLabel = currentProvider
      ? `${currentProvider.config.name} (${currentProvider.config.id})`
      : 'not selected yet';

    console.log(
      `${hero('Interactive Provider Console', 'Manage providers, inspect models, and run quick sandbox chats from one place.')}\n`,
    );
    console.log(
      boxed('Workspace overview', [
        kv('Saved providers', color.primary(String(providers.length))),
        kv('Online providers', badge.status(onlineProviders > 0)),
        kv('Active provider', currentProvider ? color.strong(selectedLabel) : color.dim(selectedLabel)),
        kv(
          'Available flows',
          [color.primary('register'), color.primary('inspect'), color.primary('chat')].join('  '),
        ),
      ], 'success'),
    );
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
    const shouldSave = await this.#prompter.confirm(
      `Save ${formatProviderDefinitionCompact(selectedProvider)} with base URL ${baseUrl}?`,
      true,
    );

    if (!shouldSave) {
      console.log(boxed('Registration cancelled', ['No changes were saved.'], 'warning'));
      return;
    }

    const registeredProvider = await this.#providerManager.saveProvider(selectedProvider.id, {
      baseUrl,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(defaultModelId ? { defaultModelId } : {}),
    });

    console.log(
      boxed('Provider saved', [
        kv('Provider', color.strong(registeredProvider.config.name)),
        kv('Base URL', registeredProvider.config.baseUrl),
        kv(
          'Status',
          registeredProvider.connection.ok
            ? badge.status(true)
            : color.warning(registeredProvider.connection.message),
        ),
        kv('Models found', color.primary(String(registeredProvider.models.length))),
      ], registeredProvider.connection.ok ? 'success' : 'warning'),
    );
  }

  async #showRegisteredProviders(): Promise<void> {
    const providers = await this.#providerManager.listProviders();

    if (providers.length === 0) {
      console.log(boxed('No providers yet', ['Register a provider to start browsing models and chatting.'], 'warning'));
      return;
    }

    console.log(sectionTitle('Registered Providers', `${providers.length} saved connection${providers.length === 1 ? '' : 's'}`));

    providers.forEach((provider, index) => {
      console.log(
        `\n${color.muted(`#${index + 1}`)}\n${providerCard({
          name: provider.name,
          providerId: provider.providerId,
          baseUrl: provider.baseUrl,
          selected: provider.selected,
          healthy: provider.healthy,
          modelCount: provider.modelCount,
        })}`,
      );
    });
  }

  async #selectActiveProvider(): Promise<void> {
    const providers = await this.#providerManager.listProviders();

    if (providers.length === 0) {
      console.log(boxed('No providers yet', ['Register at least one provider before selecting an active one.'], 'warning'));
      return;
    }

    const selectedProvider = await this.#prompter.choose(
      'Choose the active provider',
      providers,
      (provider) => formatProviderSummary(provider),
    );
    const savedProvider = await this.#providerManager.setSelectedProvider(selectedProvider.providerId);

    console.log(
      boxed('Active provider updated', [
        kv('Provider', `${color.strong(savedProvider.config.name)} (${savedProvider.config.id})`),
        kv('Base URL', savedProvider.config.baseUrl),
      ], 'success'),
    );
  }

  async #showProviderModels(): Promise<void> {
    const providers = await this.#providerManager.listProviders();

    if (providers.length === 0) {
      console.log(boxed('No providers yet', ['Register a provider first to inspect its model catalog.'], 'warning'));
      return;
    }

    const currentProvider = await this.#providerManager.getCurrentProvider();
    const provider = await this.#chooseProviderForModels(providers, currentProvider);
    const modelResult = await this.#providerManager.getProviderModels(provider.providerId);

    if (modelResult.models.length === 0) {
      console.log(
        boxed('No models available', [`Provider ${provider.name} does not currently expose any models.`], 'warning'),
      );
      return;
    }

    console.log(
      sectionTitle('Provider Models', `${provider.name} · ${modelResult.models.length} model${modelResult.models.length === 1 ? '' : 's'}`),
    );

    modelResult.models.forEach((model, index) => {
      console.log(
        `\n${color.muted(`#${index + 1}`)}\n${modelCard({
          label: model.label,
          id: model.id,
          contextWindow: model.contextWindow,
          capabilities: formatCapabilities(model)
            .split(', ')
            .filter((item) => item !== 'n/a'),
        })}`,
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
    return `${formatProviderDefinitionCompact(provider)} · ${provider.description} · default: ${provider.defaultBaseUrl}`;
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
      console.log(boxed('Sandbox unavailable', ['Select an active provider before starting sandbox chat.'], 'warning'));
      return;
    }

    const modelResult = await this.#providerManager.getProviderModels(currentProvider.config.id);

    if (modelResult.models.length === 0) {
      console.log(
        boxed('Sandbox unavailable', [`Provider ${currentProvider.config.name} does not have any available models.`], 'warning'),
      );
      return;
    }

    const selectedModel = await this.#chooseSandboxModel(currentProvider, modelResult.models);
    const history: Message[] = [];

    console.log(
      boxed('Sandbox chat ready', [
        kv('Provider', currentProvider.config.name),
        kv('Model', selectedModel.label),
        kv('Exit commands', '/exit, /quit'),
      ], 'success'),
    );

    while (true) {
      const userInput = await this.#prompter.askRequired('You');

      if (this.#isChatExitCommand(userInput)) {
        console.log(color.muted('Sandbox chat closed.'));
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
          boxed(`${icon.chat} Assistant`, [
            assistantText.length > 0 ? assistantText : color.dim('[empty response]'),
          ], 'primary'),
        );
      } catch (error) {
        stopStatus();
        history.pop();

        const message = error instanceof Error ? error.message : 'Unknown sandbox chat error.';
        console.error(boxed('Assistant request failed', [message], 'warning'));
        console.log(color.muted('You can try another message or use /exit to leave the sandbox chat.'));
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
      (model) => `${model.label} · ${model.id} · ${formatCapabilities(model)}`,
    );
  }

  #isChatExitCommand(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === '/exit' || normalized === '/quit';
  }
}
