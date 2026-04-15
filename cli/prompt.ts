import inquirer from 'inquirer';

import { color, menuOption, separator } from './theme.js';

export class CliPrompter {
  async ask(label: string): Promise<string> {
    const { value } = await inquirer.prompt<{ value: string }>([
      {
        type: 'input',
        name: 'value',
        message: label,
      },
    ]);

    return value.trim();
  }

  async askRequired(label: string): Promise<string> {
    const { value } = await inquirer.prompt<{ value: string }>([
      {
        type: 'input',
        name: 'value',
        message: label,
        validate: (input: string) =>
          input.trim().length > 0 || 'A value is required. Please try again.',
        filter: (input: string) => input.trim(),
      },
    ]);

    return value;
  }

  async askOptional(label: string, defaultValue?: string): Promise<string | undefined> {
    const { value } = await inquirer.prompt<{ value: string }>([
      {
        type: 'input',
        name: 'value',
        message: label,
        default: defaultValue,
        filter: (input: string) => input.trim(),
      },
    ]);

    return value.length > 0 ? value : defaultValue;
  }

  async confirm(label: string, defaultValue = true): Promise<boolean> {
    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: 'confirm',
        name: 'confirmed',
        message: label,
        default: defaultValue,
      },
    ]);

    return confirmed;
  }

  async choose<T>(
    label: string,
    options: readonly T[],
    render: (value: T, index: number) => string,
  ): Promise<T> {
    if (options.length === 0) {
      throw new Error('There are no available options to choose from.');
    }

    console.log(separator());
    console.log(color.strong(label));

    const { selected } = await inquirer.prompt<{ selected: T }>(
      {
        type: 'select',
        name: 'selected',
        message: color.muted('Use arrows to navigate and Enter to confirm'),
        loop: false,
        pageSize: Math.min(Math.max(options.length, 6), 12),
        choices: options.map((option, index) => ({
          name: menuOption(index, render(option, index)),
          value: option,
          short: render(option, index),
        })),
      } as never,
    );

    return selected;
  }

  async pause(message = 'Press Enter to continue'): Promise<void> {
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message,
      },
    ]);
  }

  close(): void {
    // Inquirer manages its own streams; nothing to dispose here.
  }
}
