import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import { SiteService, ITenantSite } from '../services/SiteService';

interface ICrumb {
  title: string;
  url: string;
}

/**
 * Full-width bar rendered into the Top placeholder, directly above the page's
 * command bar. Shows where the current site sits within the tenant.
 */
export class TopBreadcrumbBar {
  private readonly context: ApplicationCustomizerContext;
  private readonly siteService: SiteService;
  private readonly host: HTMLElement;

  public constructor(host: HTMLElement, context: ApplicationCustomizerContext) {
    this.host = host;
    this.context = context;
    this.siteService = new SiteService(context);
  }

  public async render(): Promise<void> {
    // Render the path-derived crumbs immediately so the bar never flashes empty,
    // then upgrade the labels once the tenant site titles come back.
    this.paint(this.buildLocalCrumbs());

    try {
      const sites: ITenantSite[] = await this.siteService.getTenantSites();
      this.paint(this.buildLocalCrumbs(sites));
    } catch {
      // Search may be unavailable or still indexing; the local crumbs stand on
      // their own, so there is nothing to recover from here.
    }
  }

  /**
   * Derive the crumb trail from the current web's server-relative URL, e.g.
   * /sites/marketing/emea becomes  Tenant › sites › marketing › emea.
   * When tenant site titles are available they replace the raw URL segments.
   */
  private buildLocalCrumbs(tenantSites: ITenantSite[] = []): ICrumb[] {
    const tenantUrl: string = this.siteService.tenantUrl;
    const serverRelativeUrl: string = this.context.pageContext.web.serverRelativeUrl;
    const currentTitle: string = this.context.pageContext.web.title;

    const titleByUrl: Record<string, string> = {};
    tenantSites.forEach((site) => {
      titleByUrl[site.url.replace(/\/$/, '').toLowerCase()] = site.title;
    });

    const crumbs: ICrumb[] = [
      { title: titleByUrl[tenantUrl.toLowerCase()] || 'Tenant home', url: tenantUrl }
    ];

    const segments: string[] = serverRelativeUrl.split('/').filter((s) => s.length > 0);
    let cumulative: string = '';

    segments.forEach((segment) => {
      cumulative += `/${segment}`;
      const absolute: string = `${tenantUrl}${cumulative}`;
      const known: string | undefined = titleByUrl[absolute.toLowerCase()];

      // 'sites' and 'teams' are managed-path noise, not real sites — keep them
      // in the trail for orientation but do not try to title them.
      crumbs.push({ title: known || TopBreadcrumbBar.prettify(segment), url: absolute });
    });

    // Make sure the final crumb reflects the current web's real title.
    if (crumbs.length > 1) {
      crumbs[crumbs.length - 1].title = currentTitle || crumbs[crumbs.length - 1].title;
    } else {
      crumbs[0].title = currentTitle || crumbs[0].title;
    }

    return crumbs;
  }

  private paint(crumbs: ICrumb[]): void {
    this.host.textContent = '';

    const bar: HTMLDivElement = document.createElement('div');
    bar.className = 'csab-topbar';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Tenant site breadcrumb');

    const label: HTMLSpanElement = document.createElement('span');
    label.className = 'csab-topbar-label';
    label.textContent = 'Site path:';
    bar.appendChild(label);

    crumbs.forEach((crumb, index) => {
      const isLast: boolean = index === crumbs.length - 1;

      if (isLast) {
        const current: HTMLSpanElement = document.createElement('span');
        current.className = 'csab-crumb csab-crumb--current';
        current.textContent = crumb.title;
        current.setAttribute('aria-current', 'page');
        bar.appendChild(current);
      } else {
        const link: HTMLAnchorElement = document.createElement('a');
        link.className = 'csab-crumb';
        link.href = crumb.url;
        link.textContent = crumb.title;
        bar.appendChild(link);

        const separator: HTMLSpanElement = document.createElement('span');
        separator.className = 'csab-crumb-sep';
        separator.textContent = '›';
        bar.appendChild(separator);
      }
    });

    this.host.appendChild(bar);
  }

  private static prettify(segment: string): string {
    const decoded: string = decodeURIComponent(segment).replace(/[-_]+/g, ' ');
    return decoded.charAt(0).toUpperCase() + decoded.slice(1);
  }
}
