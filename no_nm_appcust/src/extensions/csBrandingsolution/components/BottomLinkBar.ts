import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import { ListService, IListItem } from '../services/ListService';
import { SiteDetailsDialog } from '../dialogs/SiteDetailsDialog';

export interface IFooterLink {
  title: string;
  url: string;
}

/** Shown when the source list is missing, so the bar is never empty while testing. */
const PLACEHOLDER_LINKS: IFooterLink[] = [
  { title: 'Help Desk', url: '#' },
  { title: 'HR Policies', url: '#' },
  { title: 'Teams Request', url: '#' },
  { title: 'FAQs', url: '#' },
  { title: 'Contact Us', url: '#' }
];

/** Shape of a SharePoint hyperlink column when read over REST. */
interface IUrlFieldValue {
  Url?: string;
  Description?: string;
}

interface IFooterListItem extends IListItem {
  Title?: string;
  LinkUrl?: string | IUrlFieldValue;
}

/**
 * Full-width bar rendered into the Bottom placeholder. Links come from a
 * SharePoint list; a "Site Details" action sits pushed to the right-hand edge
 * and opens the properties/people-picker dialog.
 */
export class BottomLinkBar {
  private readonly context: ApplicationCustomizerContext;
  private readonly listService: ListService;
  private readonly host: HTMLElement;
  private readonly listTitle: string;
  private readonly maxLinks: number;

  public constructor(
    host: HTMLElement,
    context: ApplicationCustomizerContext,
    listTitle: string,
    maxLinks: number = 8
  ) {
    this.host = host;
    this.context = context;
    this.listTitle = listTitle;
    this.maxLinks = maxLinks;
    this.listService = new ListService(context);
  }

  public async render(): Promise<void> {
    let links: IFooterLink[] = PLACEHOLDER_LINKS;
    let usingPlaceholders: boolean = true;

    try {
      const items: IFooterListItem[] = await this.listService.getItems<IFooterListItem>(
        this.listTitle,
        {
          select: 'Id,Title,LinkUrl',
          orderBy: 'Id asc',
          top: this.maxLinks
        }
      );

      const mapped: IFooterLink[] = items
        .map((item) => ({
          title: item.Title ?? '(untitled)',
          url: BottomLinkBar.readUrl(item.LinkUrl)
        }))
        .filter((link) => !!link.url);

      if (mapped.length > 0) {
        links = mapped;
        usingPlaceholders = false;
      }
    } catch {
      // The list may not exist yet on a fresh site — fall back to placeholders
      // rather than leaving a broken bar on the page.
    }

    this.paint(links, usingPlaceholders);
  }

  private paint(links: IFooterLink[], usingPlaceholders: boolean): void {
    this.host.textContent = '';

    const bar: HTMLDivElement = document.createElement('div');
    bar.className = 'csab-bottombar';
    bar.setAttribute('role', 'contentinfo');

    links.slice(0, this.maxLinks).forEach((link) => {
      const anchor: HTMLAnchorElement = document.createElement('a');
      anchor.href = link.url;
      anchor.textContent = link.title;
      bar.appendChild(anchor);
    });

    if (usingPlaceholders) {
      const note: HTMLSpanElement = document.createElement('span');
      note.style.fontSize = '11px';
      note.style.opacity = '0.75';
      note.textContent = `(placeholder links — create a "${this.listTitle}" list to replace them)`;
      bar.appendChild(note);
    }

    // Spacer pushes everything after it to the right-hand edge of the bar.
    const spacer: HTMLSpanElement = document.createElement('span');
    spacer.className = 'csab-spacer';
    bar.appendChild(spacer);

    const detailsButton: HTMLButtonElement = document.createElement('button');
    detailsButton.className = 'csab-details-link';
    detailsButton.type = 'button';
    detailsButton.textContent = 'Site Details';
    detailsButton.addEventListener('click', () => {
      const dialog: SiteDetailsDialog = new SiteDetailsDialog(this.context);
      dialog.show().catch(() => undefined);
    });
    bar.appendChild(detailsButton);

    this.host.appendChild(bar);
  }

  /** A hyperlink column reads back as an object; a plain text column as a string. */
  private static readUrl(value: string | IUrlFieldValue | undefined): string {
    if (!value) return '';
    return typeof value === 'string' ? value : value.Url ?? '';
  }
}
