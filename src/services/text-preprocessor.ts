/**
 * TextPreprocessor - Clean and normalize text before embedding
 * 
 * Preprocessing pipeline:
 * 1. URL normalization/removal
 * 2. Emoji removal
 * 3. Whitespace normalization
 * 4. Markdown syntax cleanup (selective preservation)
 */
export class TextPreprocessor {
  /**
   * Remove or normalize URLs
   * - Removes http(s):// URLs
   * - Preserves domain names for context (e.g., "github.com" → "github")
   */
  removeUrls(text: string): string {
    // Remove full URLs but preserve domain names
    return text
      .replace(/https?:\/\/(www\.)?([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)(\/[^\s]*)?/g, '$2')
      .replace(/([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)(\/[^\s]*)/g, '$1');
  }

  /**
   * Remove emojis and other Unicode symbols
   * - Removes emoji characters (U+1F000-U+1FFFF)
   * - Removes other symbols (U+2000-U+2BFF)
   * - Preserves basic punctuation and alphanumeric
   */
  removeEmojis(text: string): string {
    return text
      // Remove emoji ranges
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      // Remove other symbols (arrows, geometric shapes, etc.)
      .replace(/[\u{2000}-\u{2BFF}]/gu, '')
      // Remove variation selectors
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '');
  }

  /**
   * Normalize whitespace
   * - Converts newlines to spaces
   * - Collapses multiple spaces to single space
   * - Trims leading/trailing whitespace
   */
  normalizeWhitespace(text: string): string {
    return text
      .replace(/\n+/g, ' ')  // Newlines → spaces
      .replace(/\s+/g, ' ')  // Multiple spaces → single space
      .trim();
  }

  /**
   * Clean markdown syntax while preserving content
   * - Removes headers (#, ##, etc.)
   * - Removes bold/italic markers (**, *, _, __)
   * - Removes code blocks (```, `)
   * - Removes links but preserves text ([text](url) → text)
   * - Removes images (![alt](url) → alt)
   * - Removes horizontal rules (---, ***)
   * - Preserves list content (removes bullets/numbers)
   */
  cleanMarkdown(text: string): string {
    return text
      // Remove headers (# Header → Header)
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic (**text** or __text__ → text)
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      // Remove italic (*text* or _text_ → text)
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Remove code blocks (```code``` → code)
      .replace(/```[\s\S]*?```/g, (match) => {
        // Extract code content, remove language identifier
        return match.replace(/```[a-z]*\n?/g, '').replace(/```/g, '');
      })
      // Remove inline code (`code` → code)
      .replace(/`([^`]+)`/g, '$1')
      // Remove links but preserve text ([text](url) → text)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove images (![alt](url) → alt)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Remove horizontal rules
      .replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '')
      // Remove list bullets/numbers (- item → item, 1. item → item)
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Remove blockquotes (> text → text)
      .replace(/^>\s+/gm, '');
  }

  /**
   * Full preprocessing pipeline
   * Applies all cleaning steps in order:
   * 1. URL normalization
   * 2. Markdown cleanup
   * 3. Emoji removal
   * 4. Whitespace normalization
   */
  preprocess(text: string): string {
    let processed = text;
    processed = this.removeUrls(processed);
    processed = this.cleanMarkdown(processed);
    processed = this.removeEmojis(processed);
    processed = this.normalizeWhitespace(processed);
    return processed;
  }
}

/**
 * Factory function for creating TextPreprocessor instance
 */
export function createTextPreprocessor(): TextPreprocessor {
  return new TextPreprocessor();
}
