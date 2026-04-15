import type {
  ModelConfig,
  Message,
  ProviderDefinition,
  ProviderSummary,
  RegisteredProvider,
} from '../ai-provider/src/index.js';
import type { TokenUsage } from '../ai-provider/src/domain/generation.js';
import type {
  ChannelSummary,
  ChannelUserRole,
  ChannelUserSummary,
} from '../server/src/application/channel-types.js';
import type { ProviderManagerClientContract } from './server-provider-manager-client.js';

import { CliPrompter } from './prompt.js';
import { badge, boxed, color, hero, icon, kv, modelCard, providerCard, sectionTitle, separator, terminalColumns } from './theme.js';

const menuItems = [
  'Provider settings',
  'Channels',
  'Skills',
  'Integration',
  'Sandbox chat',
  'Exit',
] as const;

const menuHints: Record<(typeof menuItems)[number], string> = {
  'Provider settings': 'Register, inspect, select, and browse models',
  Channels: 'Connect and configure communication channels',
  Skills: 'Configure available skills',
  Integration: 'Set up integrations with external services',
  'Sandbox chat': 'Try a quick prompt in the terminal',
  Exit: 'Close the CLI',
};

const providerSettingsItems = [
  'Register provider',
  'Show registered providers',
  'Select active provider',
  'Show provider models',
  'Back',
] as const;

const channelMenuItems = ['Telegram', 'Back'] as const;
const connectedTelegramItems = [
  'Add user',
  'List users',
  'Check connection',
  'Update token',
  'Disconnect channel',
  'Back',
] as const;
const channelRoleItems = ['Admin', 'Manager', 'User'] as const satisfies readonly ChannelUserRole[];

const providerSettingsHints: Record<(typeof providerSettingsItems)[number], string> = {
  'Register provider': 'Connect Ollama or LM Studio',
  'Show registered providers': 'See saved endpoints and status',
  'Select active provider': 'Choose the default provider',
  'Show provider models': 'Browse available model catalog',
  Back: 'Return to the main menu',
};

const SANDBOX_STATUS_INTERVAL_MS = 1_000;

const printDivider = (): void => console.log(`\n${separator()}`);
const clearScreen = (): void => console.clear();
const getTerminalRows = (): number => {
  const rows = process.stdout.rows;
  return typeof rows === 'number' && rows > 0 ? rows : 30;
};

const formatStatus = (healthy: boolean): string => (healthy ? 'online' : 'offline');
const formatDuration = (durationMs: number): string =>
  durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(2)} s`;

const formatTokenUsage = (usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }): string => {
  if (!usage) {
    return 'usage unavailable';
  }

  const chunks = [
    usage.inputTokens !== undefined ? `in ${usage.inputTokens}` : undefined,
    usage.outputTokens !== undefined ? `out ${usage.outputTokens}` : undefined,
    usage.totalTokens !== undefined ? `total ${usage.totalTokens}` : undefined,
  ].filter((value): value is string => Boolean(value));

  return chunks.length > 0 ? chunks.join(' · ') : 'usage unavailable';
};

interface SandboxRequestStat {
  durationMs: number;
  usage: TokenUsage | undefined;
}

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

const formatChannelStatus = (channel: ChannelSummary): string => {
  switch (channel.status) {
    case 'connected':
      return color.success('connected');
    case 'error':
      return color.warning('error');
    default:
      return color.dim('disconnected');
  }
};

const formatChannelSummary = (channel: ChannelSummary): string =>
  `${channel.label} · ${formatChannelStatus(channel)}${channel.lastError ? ` · ${color.warning(channel.lastError)}` : ''}`;

const formatChannelUser = (user: ChannelUserSummary): string =>
  `${user.displayName} · ${user.role} · ${user.telegramUserId}`;

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

const countRenderedLines = (value: string): number => {
  const width = Math.max(1, terminalColumns());
  return value.split('\n').reduce((total, line) => {
    const visibleLength = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    return total + Math.max(1, Math.ceil(visibleLength / width));
  }, 0);
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
          case 'Provider settings':
            await this.#openProviderSettings();
            break;
          case 'Channels':
            await this.#runAction(() => this.#openChannels());
            break;
          case 'Skills':
            await this.#runAction(() => this.#showPlaceholderSection(
              'Skills',
              'Skill configuration will appear here.',
            ));
            break;
          case 'Integration':
            await this.#runAction(() => this.#showPlaceholderSection(
              'Integration',
              'Integrations with external services will appear here.',
            ));
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

  async #openProviderSettings(): Promise<void> {
    let shouldReturn = false;

    while (!shouldReturn) {
      const selectedAction = await this.#prompter.choose(
        'Provider settings',
        providerSettingsItems,
        (item) => `${item} ${color.muted(`· ${providerSettingsHints[item]}`)}`,
      );

      switch (selectedAction) {
        case 'Register provider':
          await this.#runProviderSettingsAction(() => this.#registerProvider());
          break;
        case 'Show registered providers':
          await this.#runProviderSettingsAction(() => this.#showRegisteredProviders());
          break;
        case 'Select active provider':
          await this.#runProviderSettingsAction(() => this.#selectActiveProvider());
          break;
        case 'Show provider models':
          await this.#runProviderSettingsAction(() => this.#showProviderModels());
          break;
        case 'Back':
          shouldReturn = true;
          break;
      }
    }
  }

  async #openChannels(): Promise<void> {
    let shouldReturn = false;

    while (!shouldReturn) {
      const channels = await this.#providerManager.listChannels();
      const telegram = channels.find((channel) => channel.type === 'telegram');

      if (!telegram) {
        throw new Error('Telegram channel is unavailable.');
      }

      const selectedAction = await this.#prompter.choose(
        'Channels',
        channelMenuItems,
        (item) =>
          item === 'Telegram'
            ? `${item} ${color.muted(`· ${formatChannelSummary(telegram)}`)}`
            : item,
      );

      switch (selectedAction) {
        case 'Telegram':
          await this.#runProviderSettingsAction(() => this.#openTelegramChannel());
          break;
        case 'Back':
          shouldReturn = true;
          break;
      }
    }
  }

  async #runProviderSettingsAction(action: () => Promise<void>): Promise<void> {
    try {
      printDivider();
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      console.error(boxed('Action failed', [message], 'warning'));
    } finally {
      await this.#prompter.pause(color.muted('Press Enter to return to provider settings'));
    }
  }

  async #openTelegramChannel(): Promise<void> {
    const channel = await this.#providerManager.getChannelStatus('telegram');

    if (channel.status === 'connected') {
      await this.#openConnectedTelegramMenu(channel);
      return;
    }

    console.log(
      boxed('Telegram Channel', [
        kv('Status', formatChannelStatus(channel)),
        kv('Configured', channel.configured ? color.success('yes') : color.dim('no')),
        ...(channel.lastError ? [kv('Error', color.warning(channel.lastError))] : []),
      ], channel.status === 'error' ? 'warning' : 'primary'),
    );

    const shouldConnect = await this.#prompter.confirm(
      channel.configured
        ? 'Reconnect Telegram with a new bot token?'
        : 'Connect Telegram now?',
      true,
    );

    if (!shouldConnect) {
      return;
    }

    await this.#runTelegramOnboarding();
  }

  async #runTelegramOnboarding(): Promise<void> {
    const token = await this.#prompter.askRequired('Telegram bot token');
    const connectResult = await this.#providerManager.connectTelegram(token);

    console.log(
      boxed('Telegram connected', [
        kv('Bot', connectResult.bot.username ? `@${connectResult.bot.username}` : connectResult.bot.displayName),
        kv('Status', formatChannelStatus(connectResult.channel)),
        color.muted('Open the bot chat, send /start, then return here with your Telegram id and key.'),
      ], 'success'),
    );

    const telegramUserId = await this.#prompter.askRequired('Telegram user id');
    const key = await this.#prompter.askRequired('Registration key');
    const authResult = await this.#providerManager.completeTelegramAuth(telegramUserId, key);

    console.log(
      boxed('Administrator authorized', [
        kv('User', authResult.user.displayName),
        kv('Telegram ID', authResult.user.telegramUserId),
        kv('Role', color.strong(authResult.user.role)),
        kv(
          'Admin assignment',
          authResult.autoAssignedAdmin ? color.success('assigned automatically') : color.muted('reused existing access'),
        ),
      ], 'success'),
    );
  }

  async #openConnectedTelegramMenu(initialChannel: ChannelSummary): Promise<void> {
    let shouldReturn = false;
    let channel = initialChannel;

    while (!shouldReturn) {
      console.log(
        boxed('Telegram Channel', [
          kv('Status', formatChannelStatus(channel)),
          kv('Connected at', channel.connectedAt ?? color.dim('pending')),
          ...(channel.lastError ? [kv('Error', color.warning(channel.lastError))] : []),
        ], channel.status === 'error' ? 'warning' : 'success'),
      );

      const action = await this.#prompter.choose(
        'Telegram actions',
        connectedTelegramItems,
        (item) => item,
      );

      switch (action) {
        case 'Add user':
          await this.#addTelegramUser();
          break;
        case 'List users':
          await this.#manageTelegramUsers();
          break;
        case 'Check connection':
          channel = await this.#providerManager.recheckTelegram();
          console.log(boxed('Connection checked', [kv('Status', formatChannelStatus(channel))], 'success'));
          break;
        case 'Update token':
          await this.#runTelegramOnboarding();
          channel = await this.#providerManager.getChannelStatus('telegram');
          break;
        case 'Disconnect channel': {
          const confirmed = await this.#prompter.confirm('Disconnect Telegram channel?', false);

          if (!confirmed) {
            break;
          }

          channel = await this.#providerManager.disconnectTelegram();
          console.log(boxed('Telegram disconnected', [kv('Status', formatChannelStatus(channel))], 'warning'));
          shouldReturn = true;
          break;
        }
        case 'Back':
          shouldReturn = true;
          break;
      }

      if (!shouldReturn) {
        channel = await this.#providerManager.getChannelStatus('telegram');
      }
    }
  }

  async #addTelegramUser(): Promise<void> {
    console.log(
      boxed('Add Telegram User', [
        'Ask the user to open the bot chat and send /start.',
        'After that, enter the Telegram user id and the registration key shown by the bot.',
      ], 'primary'),
    );

    const telegramUserId = await this.#prompter.askRequired('Telegram user id');
    const key = await this.#prompter.askRequired('Registration key');
    const role = await this.#prompter.choose(
      'Assign a role',
      channelRoleItems,
      (item) => item,
    );

    const result = await this.#providerManager.addTelegramUser(telegramUserId, key, role);
    console.log(
      boxed('User added', [
        kv('User', result.user.displayName),
        kv('Telegram ID', result.user.telegramUserId),
        kv('Role', color.strong(result.user.role)),
      ], 'success'),
    );
  }

  async #manageTelegramUsers(): Promise<void> {
    let shouldReturn = false;

    while (!shouldReturn) {
      const users = await this.#providerManager.listTelegramUsers();

      if (users.length === 0) {
        console.log(boxed('No users yet', ['Add a Telegram user to manage channel access.'], 'warning'));
        return;
      }

      console.log(sectionTitle('Telegram Users', `${users.length} authorized user${users.length === 1 ? '' : 's'}`));
      users.forEach((user, index) => {
        console.log(
          `\n${color.muted(`#${index + 1}`)}\n${boxed(user.displayName, [
            kv('Telegram ID', user.telegramUserId),
            kv('Role', color.strong(user.role)),
            kv('Status', user.status),
            ...(user.username ? [kv('Username', `@${user.username}`)] : []),
          ], 'primary')}`,
        );
      });

      const selected = await this.#prompter.choose(
        'Choose a user to manage',
        [...users, 'Back' as const],
        (item) => item === 'Back' ? 'Back' : formatChannelUser(item),
      );

      if (selected === 'Back') {
        shouldReturn = true;
        continue;
      }

      await this.#manageTelegramUser(selected);
    }
  }

  async #manageTelegramUser(user: ChannelUserSummary): Promise<void> {
    const action = await this.#prompter.choose(
      `Manage ${user.displayName}`,
      ['Change role', 'Remove user', 'Back'] as const,
      (item) => item,
    );

    switch (action) {
      case 'Change role': {
        const role = await this.#prompter.choose(
          'Select a new role',
          channelRoleItems,
          (item) => `${item}${item === user.role ? ' (current)' : ''}`,
        );
        const updated = await this.#providerManager.updateTelegramUserRole(user.userId, role);
        console.log(boxed('Role updated', [
          kv('User', updated.displayName),
          kv('Role', color.strong(updated.role)),
        ], 'success'));
        break;
      }
      case 'Remove user': {
        const confirmed = await this.#prompter.confirm(
          `Remove ${user.displayName} from Telegram access?`,
          false,
        );

        if (!confirmed) {
          return;
        }

        const removed = await this.#providerManager.removeTelegramUser(user.userId);
        console.log(boxed('User removed', [
          kv('User', removed.displayName),
          kv('Telegram ID', removed.telegramUserId),
        ], 'warning'));
        break;
      }
      case 'Back':
        break;
    }
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
    const requestStats: SandboxRequestStat[] = [];

    const startConfirmed = await this.#prompter.confirm(
      'Sandbox mode does not use memory. Continue anyway?',
      true,
    );

    if (!startConfirmed) {
      console.log(boxed('Sandbox cancelled', ['Memory is unavailable in sandbox mode.'], 'warning'));
      return;
    }

    while (true) {
      const renderedLineCount = this.#renderSandboxScreen({
        providerName: currentProvider.config.name,
        modelLabel: selectedModel.label,
        history,
        requestStats,
      });
      this.#pushSandboxInputToBottom(renderedLineCount);
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
      const requestStartedAt = Date.now();

      try {
        const response = await this.#providerManager.sandboxChat({
          providerId: currentProvider.config.id,
          modelId: selectedModel.id,
          messages: history,
        });

        history.push(response.message);
        requestStats.push({
          durationMs: Date.now() - requestStartedAt,
          usage: response.usage,
        });

        stopStatus();
      } catch (error) {
        stopStatus();
        history.pop();

        const message = error instanceof Error ? error.message : 'Unknown sandbox chat error.';
        console.error(boxed('Assistant request failed', [message], 'warning'));
        console.log(color.muted('You can try another message or use /exit to leave the sandbox chat.'));
      }
    }
  }

  #renderSandboxScreen(input: {
    providerName: string;
    modelLabel: string;
    history: Message[];
    requestStats: SandboxRequestStat[];
  }): number {
    clearScreen();

    const sections: string[] = [];

    sections.push(
      `${hero('Sandbox Chat', 'History stays above, input stays below. Memory is disabled in this mode.')}\n`,
    );
    sections.push(
      boxed('Sandbox session', [
        kv('Provider', input.providerName),
        kv('Model', input.modelLabel),
        kv('Exit commands', '/exit, /quit'),
        kv('Memory', color.warning('disabled')),
      ], 'success'),
    );

    if (input.history.length === 0) {
      sections.push(`\n${boxed('Conversation', [color.dim('No messages yet. Your prompt will appear at the bottom.')], 'primary')}`);
      const output = sections.join('\n');
      console.log(output);
      return countRenderedLines(output);
    }

    sections.push(`\n${sectionTitle('Conversation')}`);

    let assistantResponseIndex = 0;

    input.history.forEach((message) => {
      const messageText = renderMessageContent(message.content);

      if (message.role === 'assistant') {
        const stats = input.requestStats[assistantResponseIndex];
        assistantResponseIndex += 1;

        sections.push(
          `\n${boxed(`${icon.chat} Assistant`, [
            messageText.length > 0 ? messageText : color.dim('[empty response]'),
            color.muted(`Stats: ${formatTokenUsage(stats?.usage)} · ${formatDuration(stats?.durationMs ?? 0)}`),
          ], 'primary')}`,
        );
        return;
      }

      const title =
        message.role === 'user'
          ? `${icon.prompt} You`
          : `${icon.info} ${message.role.charAt(0).toUpperCase()}${message.role.slice(1)}`;

      sections.push(
        `\n${boxed(title, [
          messageText.length > 0 ? messageText : color.dim('[empty message]'),
        ], message.role === 'user' ? 'success' : 'primary')}`,
      );
    });

    const output = sections.join('\n');
    console.log(output);
    return countRenderedLines(output);
  }

  #pushSandboxInputToBottom(renderedLineCount: number): void {
    const reservedPromptLines = 2;
    const remainingLines = getTerminalRows() - renderedLineCount - reservedPromptLines;

    if (remainingLines > 0) {
      process.stdout.write('\n'.repeat(remainingLines));
    }
  }

  async #showPlaceholderSection(title: string, description: string): Promise<void> {
    console.log(
      boxed(`${title} · Coming soon`, [
        description,
        color.muted('This section is a placeholder for the next CLI iteration.'),
      ], 'warning'),
    );
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
