import { createInterface, type Interface } from 'node:readline/promises';

const createPromptLabel = (label: string): string => `${label.trim()}: `;

export class CliPrompter {
  readonly #reader: Interface;

  constructor() {
    this.#reader = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async ask(label: string): Promise<string> {
    return (await this.#reader.question(createPromptLabel(label))).trim();
  }

  async askRequired(label: string): Promise<string> {
    while (true) {
      const value = await this.ask(label);

      if (value.length > 0) {
        return value;
      }

      console.log('A value is required. Please try again.');
    }
  }

  async askOptional(label: string, defaultValue?: string): Promise<string | undefined> {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = await this.ask(`${label}${suffix}`);

    if (answer.length > 0) {
      return answer;
    }

    return defaultValue;
  }

  async choose<T>(
    label: string,
    options: readonly T[],
    render: (value: T, index: number) => string,
  ): Promise<T> {
    if (options.length === 0) {
      throw new Error('There are no available options to choose from.');
    }

    console.log(label);

    options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${render(option, index)}`);
    });

    while (true) {
      const answer = await this.askRequired('Enter a number');
      const selectedIndex = Number.parseInt(answer, 10) - 1;

      if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < options.length) {
        return options[selectedIndex]!;
      }

      console.log('Could not recognize the selection. Enter a number from the list.');
    }
  }

  close(): void {
    this.#reader.close();
  }
}
