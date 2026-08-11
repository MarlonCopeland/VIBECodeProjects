import { SPHttpClient, SPHttpClientResponse, ISPHttpClientOptions } from '@microsoft/sp-http';
import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';

/**
 * Thin wrapper over SPHttpClient that handles the header boilerplate, request
 * digest (handled for us by SPHttpClient) and error surfacing that every one of
 * the helper services below would otherwise repeat.
 */
export class SPRest {
  protected readonly context: ApplicationCustomizerContext;

  public constructor(context: ApplicationCustomizerContext) {
    this.context = context;
  }

  /** Absolute URL of the current web, e.g. https://tenant.sharepoint.com/sites/foo */
  public get webUrl(): string {
    return this.context.pageContext.web.absoluteUrl;
  }

  /** Absolute URL of the tenant root, e.g. https://tenant.sharepoint.com */
  public get tenantUrl(): string {
    const url: URL = new URL(this.context.pageContext.web.absoluteUrl);
    return `${url.protocol}//${url.host}`;
  }

  public async get<T>(url: string, headers?: Record<string, string>): Promise<T> {
    return this.send<T>('GET', url, undefined, headers);
  }

  public async post<T>(url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.send<T>('POST', url, body, headers);
  }

  /**
   * SharePoint's classic REST endpoints do not accept a real PATCH verb, so an
   * update is a POST tunnelled via X-HTTP-Method: MERGE with an IF-MATCH etag.
   * Pass `etag` as '*' to update unconditionally.
   */
  public async update<T>(url: string, body: unknown, etag: string = '*'): Promise<T> {
    return this.send<T>('POST', url, body, {
      'IF-MATCH': etag,
      'X-HTTP-Method': 'MERGE'
    });
  }

  public async remove(url: string, etag: string = '*'): Promise<void> {
    await this.send<void>('POST', url, undefined, {
      'IF-MATCH': etag,
      'X-HTTP-Method': 'DELETE'
    });
  }

  /** Real PATCH — required by the v2.1 term store API, which is Graph-shaped. */
  public async patch<T>(url: string, body: unknown): Promise<T> {
    return this.send<T>('PATCH', url, body);
  }

  /** Real DELETE — required by the v2.1 term store API. */
  public async delete(url: string): Promise<void> {
    await this.send<void>('DELETE', url);
  }

  private async send<T>(
    method: string,
    url: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json;odata=nometadata',
      'content-type': 'application/json;odata=nometadata',
      'odata-version': '',
      ...extraHeaders
    };

    const options: ISPHttpClientOptions = { headers };
    if (body !== undefined) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    let response: SPHttpClientResponse;
    switch (method) {
      case 'GET':
        response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, options);
        break;
      case 'PATCH':
        response = await this.context.spHttpClient.fetch(url, SPHttpClient.configurations.v1, {
          ...options,
          method: 'PATCH'
        });
        break;
      case 'DELETE':
        response = await this.context.spHttpClient.fetch(url, SPHttpClient.configurations.v1, {
          ...options,
          method: 'DELETE'
        });
        break;
      default:
        response = await this.context.spHttpClient.post(url, SPHttpClient.configurations.v1, options);
        break;
    }

    if (!response.ok) {
      const detail: string = await response.text().catch(() => '');
      throw new Error(`${method} ${url} failed: ${response.status} ${response.statusText} ${detail}`);
    }

    // 204 No Content (deletes, some updates) has no body to parse.
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const text: string = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
