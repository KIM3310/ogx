function tryParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function extractBalancedJson(text: string): string | null {
  const starts = ['{', '['];

  for (let startIndex = 0; startIndex < text.length; startIndex += 1) {
    if (!starts.includes(text[startIndex] ?? '')) continue;

    let quote: '"' | "'" | null = null;
    let escaped = false;
    const stack: string[] = [];

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];

      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === '"' || char === '\'') {
        quote = char;
        continue;
      }

      if (char === '{' || char === '[') {
        stack.push(char);
        continue;
      }

      if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '[';
        if (stack[stack.length - 1] !== expected) break;
        stack.pop();
        if (stack.length === 0) {
          return text.slice(startIndex, index + 1);
        }
      }
    }
  }

  return null;
}

export function parseLooseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = tryParse<T>(trimmed);
  if (direct !== null) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fenced?.[1]) {
    const fromFence = tryParse<T>(fenced[1].trim());
    if (fromFence !== null) return fromFence;
  }

  const candidate = extractBalancedJson(trimmed);
  if (candidate) {
    const parsed = tryParse<T>(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
}
