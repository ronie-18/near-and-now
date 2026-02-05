/**
 * Format category name for display
 * Converts hyphenated names to properly formatted display names
 * 
 * Examples:
 * - 'pasta-noodles-vermicelli' → 'Pasta, Noodles and Vermicelli'
 * - 'salt-sugar' → 'Salt and Sugar'
 * - 'oils' → 'Oils'
 * - 'bakery' → 'Bakery'
 */
export function formatCategoryName(name: string): string {
  if (!name) return '';

  // Split by hyphens and filter out empty strings
  const words = name.split('-').filter(word => word.trim().length > 0);

  // If only one word, just capitalize it
  if (words.length === 1) {
    return capitalizeWord(words[0]);
  }

  // If two words, join with "and"
  if (words.length === 2) {
    return `${capitalizeWord(words[0])} and ${capitalizeWord(words[1])}`;
  }

  // If more than two words, use commas and "and" for the last item
  const capitalizedWords = words.map(word => capitalizeWord(word));
  const lastWord = capitalizedWords.pop();
  return `${capitalizedWords.join(', ')} and ${lastWord}`;
}

/**
 * Capitalize first letter of each word
 */
function capitalizeWord(word: string): string {
  return word
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

