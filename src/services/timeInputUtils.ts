/**
 * Auto-formats 24-hour HH:MM time input as the user types digits so they never
 * have to hunt for the ":" key on a mobile keyboard.
 *
 * Examples:
 * - Typing forward: "2" -> "2", "22" -> "22:", "223" -> "22:3", "2230" -> "22:30"
 * - Pasting: "0945" -> "09:45", "9:45" -> "9:45"
 * - Backspacing: "22:" -> "22" (doesn't get trapped re-adding ":")
 */
export function formatTimeHmInput(nextValue: string, prevValue = ''): string {
  const cleaned = nextValue.replace(/[^0-9:]/g, '');
  const isDeleting = nextValue.length < prevValue.length;

  // If user already typed or pasted a colon, keep clean HH:MM shape
  if (cleaned.includes(':')) {
    const [rawH, ...rest] = cleaned.split(':');
    const h = rawH.slice(0, 2);
    const m = rest.join('').slice(0, 2);
    return `${h}:${m}`;
  }

  const digits = cleaned.slice(0, 4);
  if (digits.length === 0) return '';
  if (digits.length === 1) return digits;
  if (digits.length === 2) {
    // Auto-insert ":" right after entering 2 hour digits (unless user just backspaced the ":")
    return isDeleting ? digits : `${digits}:`;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}
