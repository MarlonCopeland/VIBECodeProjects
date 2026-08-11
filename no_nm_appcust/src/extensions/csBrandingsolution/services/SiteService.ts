import { SPRest } from './SPRest';

export interface IWebProperties {
  Id: string;
  Title: string;
  Description: string;
  Url: string;
  ServerRelativeUrl: string;
  Created: string;
  LastItemModifiedDate: string;
  WebTemplate: string;
  Language: number;
  SiteLogoUrl?: string;
}

export interface ISiteProperties {
  Id: string;
  Url: string;
  ServerRelativeUrl: string;
  Owner?: { Title?: string; Email?: string };
}

export interface ITenantSite {
  title: string;
  url: string;
}

/** Read and write the current web's properties, and enumerate sites on the tenant. */
export class SiteService extends SPRest {
  private static readonly WEB_SELECT: string =
    'Id,Title,Description,Url,ServerRelativeUrl,Created,LastItemModifiedDate,WebTemplate,Language,SiteLogoUrl';

  /** READ — the current web's properties. */
  public async getWebProperties(): Promise<IWebProperties> {
    return this.get<IWebProperties>(`${this.webUrl}/_api/web?$select=${SiteService.WEB_SELECT}`);
  }

  /** READ — the parent site collection, including its owner. */
  public async getSiteProperties(): Promise<ISiteProperties> {
    return this.get<ISiteProperties>(
      `${this.webUrl}/_api/site?$select=Id,Url,ServerRelativeUrl,Owner/Title,Owner/Email&$expand=Owner`
    );
  }

  /**
   * UPDATE — write back web-level properties such as Title or Description.
   * Requires Manage Web permission on the site.
   */
  public async updateWebProperties(changes: Partial<IWebProperties>): Promise<void> {
    await this.update<void>(`${this.webUrl}/_api/web`, changes);
  }

  /**
   * READ — arbitrary key/value bag entries stored on the web (AllProperties).
   * Useful for stashing branding configuration alongside the site itself.
   */
  public async getPropertyBagValue(key: string): Promise<string | undefined> {
    const result: Record<string, unknown> = await this.get<Record<string, unknown>>(
      `${this.webUrl}/_api/web/AllProperties?$select=${encodeURIComponent(key)}`
    );
    const value: unknown = result[key] ?? result[key.replace(/_/g, '_x005f_')];
    return value === undefined ? undefined : String(value);
  }

  /** CREATE/UPDATE — set a property bag value on the current web. */
  public async setPropertyBagValue(key: string, value: string): Promise<void> {
    await this.post<void>(
      `${this.webUrl}/_api/web/AllProperties`,
      { [key]: value },
      { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }
    );
  }

  /**
   * Enumerate site collections on the tenant via the search API. Search is the
   * only surface available to a plain SPFx extension without app-only rights,
   * and it is security-trimmed to what the current user can see.
   */
  public async getTenantSites(rowLimit: number = 50): Promise<ITenantSite[]> {
    const query: string =
      `${this.tenantUrl}/_api/search/query` +
      `?querytext='contentclass:STS_Site'` +
      `&selectproperties='Title,Path'` +
      `&rowlimit=${rowLimit}` +
      `&trimduplicates=false`;

    interface ISearchCell {
      Key: string;
      Value: string;
    }
    interface ISearchResponse {
      PrimaryQueryResult?: {
        RelevantResults?: {
          Table?: { Rows?: { Cells: ISearchCell[] }[] };
        };
      };
    }

    const response: ISearchResponse = await this.get<ISearchResponse>(query);
    const rows = response.PrimaryQueryResult?.RelevantResults?.Table?.Rows ?? [];

    return rows
      .map((row) => {
        const cells: ISearchCell[] = row.Cells ?? [];
        const find = (key: string): string =>
          cells.filter((c) => c.Key === key).map((c) => c.Value)[0] ?? '';
        return { title: find('Title'), url: find('Path') };
      })
      .filter((site) => !!site.url);
  }
}
