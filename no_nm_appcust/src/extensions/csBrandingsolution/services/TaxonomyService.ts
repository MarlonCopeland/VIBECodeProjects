import { SPRest } from './SPRest';

export interface ILocalizedName {
  name: string;
  languageTag: string;
}

export interface ITermLabel {
  name: string;
  languageTag: string;
  isDefault: boolean;
}

export interface ITermGroup {
  id: string;
  displayName: string;
  description?: string;
  scope?: string;
}

export interface ITermSet {
  id: string;
  localizedNames: ILocalizedName[];
  description?: string;
}

export interface ITerm {
  id: string;
  labels: ITermLabel[];
  descriptions?: { description: string; languageTag: string }[];
  childrenCount?: number;
}

export interface ITermStoreInfo {
  id: string;
  defaultLanguageTag: string;
  languageTags: string[];
}

/**
 * CRUD over the managed metadata term store using the modern `/_api/v2.1/termStore`
 * surface. This replaces the retired `@microsoft/sp-taxonomy` library and is
 * Graph-shaped, so it wants real PATCH/DELETE verbs and plain JSON headers
 * rather than the classic OData ones.
 */
export class TaxonomyService extends SPRest {
  /** The v2.1 term store API rejects `odata=nometadata`; it speaks plain JSON. */
  private static readonly JSON_HEADERS: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json'
  };

  private get base(): string {
    return `${this.webUrl}/_api/v2.1/termStore`;
  }

  private defaultLanguage: string = 'en-US';

  /** READ — term store metadata. Also caches the default language for writes. */
  public async getTermStoreInfo(): Promise<ITermStoreInfo> {
    const info: ITermStoreInfo = await this.get<ITermStoreInfo>(
      this.base,
      TaxonomyService.JSON_HEADERS
    );
    if (info?.defaultLanguageTag) {
      this.defaultLanguage = info.defaultLanguageTag;
    }
    return info;
  }

  // --------------------------------------------------------------- groups ---

  /** READ — all term groups. */
  public async getGroups(): Promise<ITermGroup[]> {
    const response = await this.get<{ value: ITermGroup[] }>(
      `${this.base}/groups`,
      TaxonomyService.JSON_HEADERS
    );
    return response.value ?? [];
  }

  /** CREATE — a new term group. */
  public async createGroup(displayName: string, description: string = ''): Promise<ITermGroup> {
    return this.post<ITermGroup>(
      `${this.base}/groups`,
      { displayName, description },
      TaxonomyService.JSON_HEADERS
    );
  }

  /** DELETE — remove a term group (must be empty). */
  public async deleteGroup(groupId: string): Promise<void> {
    await this.delete(`${this.base}/groups/${groupId}`);
  }

  // ----------------------------------------------------------------- sets ---

  /** READ — term sets inside a group. */
  public async getTermSets(groupId: string): Promise<ITermSet[]> {
    const response = await this.get<{ value: ITermSet[] }>(
      `${this.base}/groups/${groupId}/sets`,
      TaxonomyService.JSON_HEADERS
    );
    return response.value ?? [];
  }

  /** CREATE — a term set inside a group. */
  public async createTermSet(groupId: string, name: string): Promise<ITermSet> {
    return this.post<ITermSet>(
      `${this.base}/groups/${groupId}/sets`,
      { localizedNames: [{ name, languageTag: this.defaultLanguage }] },
      TaxonomyService.JSON_HEADERS
    );
  }

  /** UPDATE — rename a term set. */
  public async updateTermSet(setId: string, name: string): Promise<ITermSet> {
    return this.patch<ITermSet>(`${this.base}/sets/${setId}`, {
      localizedNames: [{ name, languageTag: this.defaultLanguage }]
    });
  }

  /** DELETE — remove a term set. */
  public async deleteTermSet(setId: string): Promise<void> {
    await this.delete(`${this.base}/sets/${setId}`);
  }

  // ---------------------------------------------------------------- terms ---

  /** READ — the top-level terms in a set. */
  public async getTerms(setId: string): Promise<ITerm[]> {
    const response = await this.get<{ value: ITerm[] }>(
      `${this.base}/sets/${setId}/children`,
      TaxonomyService.JSON_HEADERS
    );
    return response.value ?? [];
  }

  /** READ — the children of a specific term. */
  public async getChildTerms(setId: string, termId: string): Promise<ITerm[]> {
    const response = await this.get<{ value: ITerm[] }>(
      `${this.base}/sets/${setId}/terms/${termId}/children`,
      TaxonomyService.JSON_HEADERS
    );
    return response.value ?? [];
  }

  /**
   * CREATE — add a term. Omit `parentTermId` to create at the root of the set,
   * or pass one to nest the new term underneath an existing term.
   */
  public async createTerm(setId: string, name: string, parentTermId?: string): Promise<ITerm> {
    const url: string = parentTermId
      ? `${this.base}/sets/${setId}/terms/${parentTermId}/children`
      : `${this.base}/sets/${setId}/children`;

    return this.post<ITerm>(
      url,
      { labels: [{ name, languageTag: this.defaultLanguage, isDefault: true }] },
      TaxonomyService.JSON_HEADERS
    );
  }

  /** UPDATE — rename a term. */
  public async updateTerm(setId: string, termId: string, name: string): Promise<ITerm> {
    return this.patch<ITerm>(`${this.base}/sets/${setId}/terms/${termId}`, {
      labels: [{ name, languageTag: this.defaultLanguage, isDefault: true }]
    });
  }

  /** DELETE — remove a term and its children. */
  public async deleteTerm(setId: string, termId: string): Promise<void> {
    await this.delete(`${this.base}/sets/${setId}/terms/${termId}`);
  }

  /** Convenience: the default label of a term in the store's default language. */
  public static getTermName(term: ITerm): string {
    const labels: ITermLabel[] = term.labels ?? [];
    const preferred: ITermLabel | undefined = labels.filter((l) => l.isDefault)[0];
    return (preferred ?? labels[0])?.name ?? '(unnamed term)';
  }

  /** Convenience: the localized name of a term set. */
  public static getTermSetName(set: ITermSet): string {
    return set.localizedNames?.[0]?.name ?? '(unnamed set)';
  }
}
