import { SPRest } from './SPRest';

export interface IListInfo {
  Id: string;
  Title: string;
  Description: string;
  BaseTemplate: number;
  ItemCount: number;
  Hidden: boolean;
}

export interface IListItem {
  Id: number;
  Title?: string;
  [field: string]: unknown;
}

export interface IGetItemsOptions {
  select?: string;
  filter?: string;
  orderBy?: string;
  expand?: string;
  top?: number;
}

/** CRUD over SharePoint lists and the items inside them. */
export class ListService extends SPRest {
  /** Generic custom list template id. */
  public static readonly TEMPLATE_GENERIC_LIST: number = 100;
  /** Document library template id. */
  public static readonly TEMPLATE_DOCUMENT_LIBRARY: number = 101;

  private listUrl(title: string): string {
    return `${this.webUrl}/_api/web/lists/getByTitle('${encodeURIComponent(title.replace(/'/g, "''"))}')`;
  }

  // ---------------------------------------------------------------- lists ---

  /** READ — all non-hidden lists on the current web. */
  public async getLists(): Promise<IListInfo[]> {
    const response = await this.get<{ value: IListInfo[] }>(
      `${this.webUrl}/_api/web/lists?$select=Id,Title,Description,BaseTemplate,ItemCount,Hidden&$filter=Hidden eq false`
    );
    return response.value;
  }

  /** READ — a single list by title. Returns undefined when it does not exist. */
  public async getList(title: string): Promise<IListInfo | undefined> {
    try {
      return await this.get<IListInfo>(
        `${this.listUrl(title)}?$select=Id,Title,Description,BaseTemplate,ItemCount,Hidden`
      );
    } catch {
      return undefined;
    }
  }

  /** CREATE — a new list. */
  public async createList(
    title: string,
    description: string = '',
    template: number = ListService.TEMPLATE_GENERIC_LIST
  ): Promise<IListInfo> {
    return this.post<IListInfo>(`${this.webUrl}/_api/web/lists`, {
      Title: title,
      Description: description,
      BaseTemplate: template,
      AllowContentTypes: true,
      ContentTypesEnabled: true
    });
  }

  /** UPDATE — change list-level settings such as Title or Description. */
  public async updateList(title: string, changes: Partial<IListInfo>): Promise<void> {
    await this.update<void>(this.listUrl(title), changes);
  }

  /** DELETE — remove a list and everything in it. */
  public async deleteList(title: string): Promise<void> {
    await this.remove(this.listUrl(title));
  }

  /** CREATE — add a text/note/url column to a list. */
  public async addTextField(listTitle: string, fieldName: string): Promise<void> {
    await this.post<void>(`${this.listUrl(listTitle)}/fields`, {
      Title: fieldName,
      FieldTypeKind: 2, // SP.FieldType.text
      MaxLength: 255
    });
  }

  // ---------------------------------------------------------------- items ---

  /** READ — items from a list, with optional OData shaping. */
  public async getItems<T extends IListItem = IListItem>(
    listTitle: string,
    options: IGetItemsOptions = {}
  ): Promise<T[]> {
    const parts: string[] = [];
    if (options.select) parts.push(`$select=${options.select}`);
    if (options.expand) parts.push(`$expand=${options.expand}`);
    if (options.filter) parts.push(`$filter=${options.filter}`);
    if (options.orderBy) parts.push(`$orderby=${options.orderBy}`);
    parts.push(`$top=${options.top ?? 100}`);

    const response = await this.get<{ value: T[] }>(
      `${this.listUrl(listTitle)}/items?${parts.join('&')}`
    );
    return response.value;
  }

  /** READ — a single item by id. */
  public async getItem<T extends IListItem = IListItem>(
    listTitle: string,
    itemId: number
  ): Promise<T> {
    return this.get<T>(`${this.listUrl(listTitle)}/items(${itemId})`);
  }

  /** CREATE — add an item. */
  public async addItem<T extends IListItem = IListItem>(
    listTitle: string,
    values: Record<string, unknown>
  ): Promise<T> {
    return this.post<T>(`${this.listUrl(listTitle)}/items`, values);
  }

  /** UPDATE — patch an existing item. */
  public async updateItem(
    listTitle: string,
    itemId: number,
    values: Record<string, unknown>
  ): Promise<void> {
    await this.update<void>(`${this.listUrl(listTitle)}/items(${itemId})`, values);
  }

  /** DELETE — remove an item. */
  public async deleteItem(listTitle: string, itemId: number): Promise<void> {
    await this.remove(`${this.listUrl(listTitle)}/items(${itemId})`);
  }

  /**
   * Convenience for people/group columns: SharePoint expects the lookup id of
   * the user, written to the `<FieldName>Id` property rather than the field itself.
   */
  public async setPersonField(
    listTitle: string,
    itemId: number,
    fieldName: string,
    userId: number
  ): Promise<void> {
    await this.updateItem(listTitle, itemId, { [`${fieldName}Id`]: userId });
  }
}
