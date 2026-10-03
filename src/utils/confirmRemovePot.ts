/** Two-step confirm for removing a pot; returns the chosen scope or null when cancelled. */
export function confirmRemovePot(
  name: string,
  expenseCount: number,
): 'this' | 'following' | null {
  const detail =
    expenseCount > 0
      ? `${expenseCount} expense(s) in this pot will be deleted and its dedication set to $0.`
      : 'Its dedication will be set to $0.';
  if (!confirm(`Remove pot “${name}”?\n\n${detail}`)) return null;
  const following = confirm(
    `Also remove “${name}” from all FOLLOWING periods?\n\nOK = this period + following\nCancel = this period only`,
  );
  return following ? 'following' : 'this';
}
