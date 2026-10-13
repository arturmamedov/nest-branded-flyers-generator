import type { ReactNode } from 'react';
import { DOWNLOAD, EXPORT_ACTION, type ExportAction, type Offer } from './exportActions';
import { Menu } from './Menu';

/* The buttons for a flyer's ways out as a picture: the first one (exportActions.ts says which) and "Download ▾", in
   the editor's bar, on a library card and in the lightbox. What each one does is the page's (pictureActions.ts). */
export function WaysOut({
  offer: { first, menu },
  act,
  busy,
  disabled,
  dark = false,
  children,
}: {
  offer: Offer;
  act: Record<ExportAction, () => void>;
  /** The page's action in hand, whatever it is: a button reads what its own action is doing. */
  busy: string | null;
  /** Greyed: the page has an action in hand, or the flyer cannot be made into a picture now. */
  disabled: boolean;
  /** On the editor's dark bar. */
  dark?: boolean;
  /** What stands between the first button and Download: the library's "Copy text". */
  children?: ReactNode;
}) {
  const working = menu.find((action) => action === busy);
  return (
    <>
      {/* The first way out is the main button, and Download stands beside it; alone, Download is. */}
      {first && (
        <button type="button" className="btn btn-accent" disabled={disabled} onClick={act[first]}>
          {busy === first ? EXPORT_ACTION[first].busy : EXPORT_ACTION[first].label}
        </button>
      )}
      {children}
      {/* While one of its entries works, the button reads what that entry is doing. */}
      <Menu
        label={working ? EXPORT_ACTION[working].busy : DOWNLOAD}
        className={!first ? 'btn btn-accent' : dark ? 'btn btn-dark' : 'btn'}
        disabled={disabled}
        entries={menu.map((action) => ({ id: action, label: EXPORT_ACTION[action].label, hint: EXPORT_ACTION[action].hint, onPick: act[action] }))}
      />
    </>
  );
}
