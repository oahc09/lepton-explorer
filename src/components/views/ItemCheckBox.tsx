import { useSelectionStore } from '../../state/selectionStore';
import type { Entry } from '../../types';

/**
 * Win11 "Item check boxes" (View ▸ Show/hide ▸ Item check boxes).
 *
 * Renders a checkbox overlaid on a file item so multiple items can be selected
 * without holding Ctrl — mainly for touch input. Clicking the box toggles this
 * item's membership in the selection; pointer events are stopped so the click
 * does not also start a drag or trigger the item's own select handler.
 */
export function ItemCheckBox({ item }: { item: Entry }) {
  const checked = useSelectionStore((s) => s.selected.includes(item.path));
  return (
    <input
      type="checkbox"
      className="item-checkbox"
      checked={checked}
      aria-label={`选择 ${item.name}`}
      // Stop propagation so the checkbox click never starts an item drag or
      // reaches the item's own click/select handler.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={() => useSelectionStore.getState().toggle(item)}
    />
  );
}
