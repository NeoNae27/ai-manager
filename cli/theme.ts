const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const FG = {
  slate: '\x1b[38;5;245m',
  cyan: '\x1b[38;5;81m',
  mint: '\x1b[38;5;85m',
  amber: '\x1b[38;5;221m',
  rose: '\x1b[38;5;203m',
  violet: '\x1b[38;5;141m',
  white: '\x1b[38;5;255m',
} as const;

const stripAnsi = (value: string): string => value.replace(/\x1b\[[0-9;]*m/g, '');

const visibleLength = (value: string): number => stripAnsi(value).length;

const padRight = (value: string, width: number): string => {
  const padding = Math.max(0, width - visibleLength(value));
  return `${value}${' '.repeat(padding)}`;
};

const terminalWidth = (): number => {
  const columns = process.stdout.columns;
  return typeof columns === 'number' && columns > 0 ? columns : 100;
};

const wrapLine = (text: string, width: number): string[] => {
  if (width <= 0) {
    return [text];
  }

  const words = text.split(/\s+/).filter((word) => word.length > 0);

  if (words.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`;

    if (visibleLength(next) <= width) {
      current = next;
      continue;
    }

    if (current.length > 0) {
      lines.push(current);
      current = word;
      continue;
    }

    lines.push(word);
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
};

const normalizeLines = (content: string, width: number): string[] =>
  content
    .split('\n')
    .flatMap((line) => wrapLine(line, width));

export const color = {
  muted: (value: string): string => `${FG.slate}${value}${RESET}`,
  primary: (value: string): string => `${FG.cyan}${value}${RESET}`,
  success: (value: string): string => `${FG.mint}${value}${RESET}`,
  warning: (value: string): string => `${FG.amber}${value}${RESET}`,
  danger: (value: string): string => `${FG.rose}${value}${RESET}`,
  accent: (value: string): string => `${FG.violet}${value}${RESET}`,
  strong: (value: string): string => `${BOLD}${FG.white}${value}${RESET}`,
  dim: (value: string): string => `${DIM}${value}${RESET}`,
};

export const icon = {
  brand: '◈',
  prompt: '›',
  ok: '●',
  warn: '▲',
  error: '■',
  info: '◇',
  chat: '✦',
} as const;

export const badge = {
  status(ok: boolean): string {
    return ok ? color.success(`${icon.ok} online`) : color.danger(`${icon.error} offline`);
  },
  selected(selected: boolean): string {
    return selected ? color.accent('selected') : color.dim('available');
  },
  capability(value: string): string {
    return color.primary(value);
  },
};

export const separator = (): string => color.dim('─'.repeat(Math.min(terminalWidth(), 72)));

export const sectionTitle = (title: string, subtitle?: string): string => {
  const heading = `${color.strong(title)}`;
  return subtitle ? `${heading}\n${color.muted(subtitle)}` : heading;
};

export const boxed = (title: string, lines: string[], tone: 'primary' | 'success' | 'warning' = 'primary'): string => {
  const palette =
    tone === 'success' ? color.success : tone === 'warning' ? color.warning : color.primary;
  const maxContentWidth = Math.min(Math.max(40, terminalWidth() - 6), 94);
  const preparedLines = normalizeLines(lines.join('\n'), maxContentWidth);
  const width = Math.max(
    visibleLength(title),
    ...preparedLines.map((line) => visibleLength(line)),
    20,
  );

  const top = palette(`╭─ ${title} ${'─'.repeat(Math.max(0, width - visibleLength(title) - 1))}╮`);
  const middle = preparedLines.map((line) => `${palette('│')} ${padRight(line, width)} ${palette('│')}`);
  const bottom = palette(`╰${'─'.repeat(width + 2)}╯`);

  return [top, ...middle, bottom].join('\n');
};

export const hero = (title: string, subtitle: string): string =>
  boxed(
    `${icon.brand} AI Manager`,
    [color.strong(title), '', subtitle],
    'primary',
  );

export const menuOption = (index: number, label: string, hint?: string): string => {
  const prefix = color.accent(`${index + 1}.`);
  return hint
    ? `${prefix} ${color.strong(label)} ${color.muted(`· ${hint}`)}`
    : `${prefix} ${color.strong(label)}`;
};

export const kv = (label: string, value: string): string =>
  `${color.muted(`${label}:`)} ${value}`;

export const providerCard = (provider: {
  name: string;
  providerId: string;
  baseUrl: string;
  selected: boolean;
  healthy: boolean;
  modelCount: number;
}): string =>
  boxed(provider.name, [
    kv('Provider', color.strong(provider.providerId)),
    kv('Base URL', provider.baseUrl),
    kv('Status', badge.status(provider.healthy)),
    kv('Mode', badge.selected(provider.selected)),
    kv('Models', color.primary(String(provider.modelCount))),
  ]);

export const modelCard = (model: {
  label: string;
  id: string;
  contextWindow: number;
  capabilities: string[];
}): string =>
  boxed(model.label, [
    kv('Model ID', color.strong(model.id)),
    kv('Context', `${model.contextWindow}`),
    kv(
      'Capabilities',
      model.capabilities.length > 0
        ? model.capabilities.map((item) => badge.capability(item)).join(', ')
        : color.dim('n/a'),
    ),
  ]);
