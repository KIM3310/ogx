export function shEscape(value: string): string {
  // POSIX-safe single-quote escaping: 'abc' -> '\'' for embedded quotes.
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildShellCommand(tokens: string[]): string {
  return tokens.map(shEscape).join(" ");
}
