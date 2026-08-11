import { SPRest } from './SPRest';

/** PrincipalType is a bit flag; 15 means "any principal". */
export enum PrincipalType {
  User = 1,
  DistributionList = 2,
  SecurityGroup = 4,
  SharePointGroup = 8,
  All = 15
}

export interface IPersonaResult {
  /** Claims-encoded login name, e.g. i:0#.f|membership|user@contoso.com */
  loginName: string;
  displayName: string;
  email: string;
  /** SharePoint entity type, e.g. 'User' or 'SecGroup'. */
  entityType: string;
}

export interface IEnsuredUser {
  Id: number;
  Title: string;
  Email: string;
  LoginName: string;
}

interface IPickerEntity {
  Key: string;
  DisplayText: string;
  EntityType: string;
  EntityData?: { Email?: string; AccountName?: string; PrincipalType?: string };
}

/**
 * Backs the people picker control. Uses the same ClientPeoplePicker endpoint the
 * out-of-the-box SharePoint picker calls, so results and security trimming match
 * what users see elsewhere in the site.
 */
export class PeopleService extends SPRest {
  /** Search for people/groups matching a query string. */
  public async search(
    query: string,
    maxSuggestions: number = 15,
    principalType: PrincipalType = PrincipalType.All
  ): Promise<IPersonaResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const url: string =
      `${this.webUrl}/_api/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface` +
      `.clientPeoplePickerSearchUser`;

    const body = {
      queryParams: {
        AllowEmailAddresses: true,
        AllowMultipleEntities: false,
        AllUrlZones: false,
        MaximumEntitySuggestions: maxSuggestions,
        PrincipalSource: 15,
        PrincipalType: principalType,
        QueryString: query,
        SharePointGroupID: 0
      }
    };

    const response = await this.post<{ value: string | IPickerEntity[] }>(url, body);

    // The endpoint returns the entity array as a JSON-encoded *string* under
    // `value`, so it needs a second parse before it is usable.
    const raw: string | IPickerEntity[] = response?.value ?? [];
    const entities: IPickerEntity[] = typeof raw === 'string' ? JSON.parse(raw) : raw;

    return entities.map((entity) => ({
      loginName: entity.EntityData?.AccountName ?? entity.Key,
      displayName: entity.DisplayText,
      email: entity.EntityData?.Email ?? '',
      entityType: entity.EntityType
    }));
  }

  /**
   * Resolve a login name to a real site user, creating the user entry in the
   * site's user information list if it is not there yet. You need the resulting
   * numeric `Id` before you can write to a Person or Group column.
   */
  public async ensureUser(loginName: string): Promise<IEnsuredUser> {
    return this.post<IEnsuredUser>(`${this.webUrl}/_api/web/ensureuser`, { logonName: loginName });
  }

  /** The currently signed-in user. */
  public async getCurrentUser(): Promise<IEnsuredUser> {
    return this.get<IEnsuredUser>(`${this.webUrl}/_api/web/currentUser`);
  }
}
