import { BaseDialog, IDialogConfiguration } from '@microsoft/sp-dialog';
import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';

import { SiteService, IWebProperties, ISiteProperties } from '../services/SiteService';
import { PeopleService, IPersonaResult } from '../services/PeopleService';
import { TaxonomyService, ITermGroup, ITermSet, ITerm } from '../services/TaxonomyService';
import { PeoplePicker } from '../controls/PeoplePicker';
import { injectStyles } from '../styles/injectStyles';

/**
 * Popup launched from the "Site Details" link in the footer.
 *
 * Demonstrates two things at once: reading site/web properties through the
 * helper services, and hosting real interactive form controls — including a
 * working people picker — inside an SPFx dialog.
 */
export class SiteDetailsDialog extends BaseDialog {
  private readonly siteService: SiteService;
  private readonly peopleService: PeopleService;
  private readonly taxonomyService: TaxonomyService;

  private webProperties: IWebProperties | undefined;
  private siteProperties: ISiteProperties | undefined;
  private termGroups: ITermGroup[] = [];
  private loadError: string | undefined;
  private taxonomyError: string | undefined;

  private picker: PeoplePicker | undefined;

  public constructor(context: ApplicationCustomizerContext) {
    super({ isBlocking: false });
    this.siteService = new SiteService(context);
    this.peopleService = new PeopleService(context);
    this.taxonomyService = new TaxonomyService(context);
  }

  public getConfig(): IDialogConfiguration {
    return { isBlocking: false };
  }

  /** Fetch everything the dialog needs before it becomes visible. */
  protected async onBeforeOpen(): Promise<void> {
    injectStyles();
    try {
      this.webProperties = await this.siteService.getWebProperties();
      this.siteProperties = await this.siteService.getSiteProperties();
    } catch (error) {
      this.loadError = (error as Error).message;
    }

    // The term store lives behind a separate permission, so a failure here must
    // not take the rest of the dialog down with it.
    try {
      await this.taxonomyService.getTermStoreInfo();
      this.termGroups = await this.taxonomyService.getGroups();
    } catch (error) {
      this.taxonomyError = (error as Error).message;
    }
  }

  protected onAfterClose(): void {
    this.picker?.dispose();
    this.picker = undefined;
    super.onAfterClose();
  }

  protected render(): void {
    const root: HTMLDivElement = document.createElement('div');
    root.className = 'csab-dialog';

    const heading: HTMLHeadingElement = document.createElement('h2');
    heading.textContent = 'Site Details';
    root.appendChild(heading);

    const sub: HTMLParagraphElement = document.createElement('p');
    sub.className = 'csab-dialog-sub';
    sub.textContent = 'Properties for the current site, plus a test form.';
    root.appendChild(sub);

    root.appendChild(this.renderProperties());
    root.appendChild(this.renderTaxonomy());
    root.appendChild(this.renderForm());

    this.domElement.textContent = '';
    this.domElement.appendChild(root);
  }

  // ----------------------------------------------------------- properties ---

  private renderProperties(): HTMLElement {
    const section: HTMLDivElement = document.createElement('div');

    const title: HTMLHeadingElement = document.createElement('h3');
    title.textContent = 'Site properties';
    section.appendChild(title);

    if (this.loadError) {
      const error: HTMLParagraphElement = document.createElement('p');
      error.className = 'csab-error';
      error.textContent = `Could not load site properties: ${this.loadError}`;
      section.appendChild(error);
      return section;
    }

    const web: IWebProperties | undefined = this.webProperties;
    const rows: [string, string][] = [
      ['Title', web?.Title ?? '—'],
      ['Description', web?.Description || '(none)'],
      ['URL', web?.Url ?? '—'],
      ['Web ID', web?.Id ?? '—'],
      ['Site collection ID', this.siteProperties?.Id ?? '—'],
      ['Owner', this.siteProperties?.Owner?.Title ?? '(not available)'],
      ['Template', web?.WebTemplate ?? '—'],
      ['Language (LCID)', web ? String(web.Language) : '—'],
      ['Created', SiteDetailsDialog.formatDate(web?.Created)],
      ['Last modified', SiteDetailsDialog.formatDate(web?.LastItemModifiedDate)]
    ];

    const table: HTMLTableElement = document.createElement('table');
    table.className = 'csab-props';
    const body: HTMLTableSectionElement = document.createElement('tbody');

    rows.forEach(([label, value]) => {
      const tr: HTMLTableRowElement = document.createElement('tr');
      const th: HTMLTableCellElement = document.createElement('th');
      th.textContent = label;
      const td: HTMLTableCellElement = document.createElement('td');
      td.textContent = value;
      tr.appendChild(th);
      tr.appendChild(td);
      body.appendChild(tr);
    });

    table.appendChild(body);
    section.appendChild(table);
    return section;
  }

  // ------------------------------------------------------------- taxonomy ---

  /**
   * Term store browser: group → term set → terms. Exercises the read side of
   * TaxonomyService live; the create/update/delete methods on that service use
   * the same endpoints.
   */
  private renderTaxonomy(): HTMLElement {
    const section: HTMLDivElement = document.createElement('div');

    const title: HTMLHeadingElement = document.createElement('h3');
    title.textContent = 'Managed metadata (term store)';
    section.appendChild(title);

    if (this.taxonomyError) {
      const error: HTMLParagraphElement = document.createElement('p');
      error.className = 'csab-error';
      error.textContent = `Term store unavailable: ${this.taxonomyError}`;
      section.appendChild(error);
      return section;
    }

    if (this.termGroups.length === 0) {
      const empty: HTMLParagraphElement = document.createElement('p');
      empty.className = 'csab-dialog-sub';
      empty.textContent = 'No term groups are visible to you in this term store.';
      section.appendChild(empty);
      return section;
    }

    const groupSelect: HTMLSelectElement = document.createElement('select');
    groupSelect.className = 'csab-select';
    this.termGroups.forEach((group) => {
      const option: HTMLOptionElement = document.createElement('option');
      option.value = group.id;
      option.textContent = group.displayName;
      groupSelect.appendChild(option);
    });
    section.appendChild(SiteDetailsDialog.field('Term group', groupSelect));

    const setSelect: HTMLSelectElement = document.createElement('select');
    setSelect.className = 'csab-select';
    section.appendChild(SiteDetailsDialog.field('Term set', setSelect));

    const termOutput: HTMLDivElement = document.createElement('div');
    termOutput.className = 'csab-note';
    termOutput.textContent = 'Select a term set to list its terms.';
    section.appendChild(termOutput);

    const loadTerms = (setId: string): void => {
      if (!setId) {
        termOutput.textContent = 'This group has no term sets.';
        return;
      }
      termOutput.textContent = 'Loading terms…';
      this.taxonomyService
        .getTerms(setId)
        .then((terms: ITerm[]) => {
          termOutput.textContent =
            terms.length > 0
              ? terms.map((t) => `• ${TaxonomyService.getTermName(t)}`).join('\n')
              : 'This term set has no terms.';
        })
        .catch((error: Error) => {
          termOutput.textContent = `Could not load terms: ${error.message}`;
        });
    };

    const loadSets = (groupId: string): void => {
      setSelect.textContent = '';
      termOutput.textContent = 'Loading term sets…';
      this.taxonomyService
        .getTermSets(groupId)
        .then((sets: ITermSet[]) => {
          sets.forEach((set) => {
            const option: HTMLOptionElement = document.createElement('option');
            option.value = set.id;
            option.textContent = TaxonomyService.getTermSetName(set);
            setSelect.appendChild(option);
          });
          loadTerms(setSelect.value);
        })
        .catch((error: Error) => {
          termOutput.textContent = `Could not load term sets: ${error.message}`;
        });
    };

    groupSelect.addEventListener('change', () => loadSets(groupSelect.value));
    setSelect.addEventListener('change', () => loadTerms(setSelect.value));
    loadSets(groupSelect.value);

    return section;
  }

  // ----------------------------------------------------------------- form ---

  private renderForm(): HTMLElement {
    const section: HTMLDivElement = document.createElement('div');

    const title: HTMLHeadingElement = document.createElement('h3');
    title.textContent = 'Test form controls';
    section.appendChild(title);

    // People picker — the control this dialog exists to prove out.
    const pickerField: HTMLDivElement = document.createElement('div');
    pickerField.className = 'csab-field';
    const pickerLabel: HTMLLabelElement = document.createElement('label');
    pickerLabel.textContent = 'Site contact (people picker)';
    pickerField.appendChild(pickerLabel);
    const pickerHost: HTMLDivElement = document.createElement('div');
    pickerField.appendChild(pickerHost);
    section.appendChild(pickerField);

    this.picker = new PeoplePicker(pickerHost, this.peopleService, {
      multiSelect: true,
      placeholder: 'Start typing a name or email…'
    });

    // A representative spread of the other control types a form would need.
    const textInput: HTMLInputElement = document.createElement('input');
    textInput.className = 'csab-input';
    textInput.type = 'text';
    textInput.value = 'Placeholder value';
    section.appendChild(SiteDetailsDialog.field('Display name (text)', textInput));

    const select: HTMLSelectElement = document.createElement('select');
    select.className = 'csab-select';
    ['Corporate', 'Human Resources', 'Operations', 'Technology'].forEach((option) => {
      const opt: HTMLOptionElement = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      select.appendChild(opt);
    });
    section.appendChild(SiteDetailsDialog.field('Business area (dropdown)', select));

    const date: HTMLInputElement = document.createElement('input');
    date.className = 'csab-input';
    date.type = 'date';
    date.value = new Date().toISOString().substring(0, 10);
    section.appendChild(SiteDetailsDialog.field('Review date (date)', date));

    const notes: HTMLTextAreaElement = document.createElement('textarea');
    notes.className = 'csab-textarea';
    notes.placeholder = 'Free text notes…';
    section.appendChild(SiteDetailsDialog.field('Notes (multi-line)', notes));

    const checkboxRow: HTMLDivElement = document.createElement('div');
    checkboxRow.className = 'csab-checkbox-row';
    const checkbox: HTMLInputElement = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'csab-featured';
    const checkboxLabel: HTMLLabelElement = document.createElement('label');
    checkboxLabel.htmlFor = 'csab-featured';
    checkboxLabel.textContent = 'Show this site in the footer links';
    checkboxLabel.style.fontWeight = 'normal';
    checkboxLabel.style.margin = '0';
    checkboxRow.appendChild(checkbox);
    checkboxRow.appendChild(checkboxLabel);
    const checkboxField: HTMLDivElement = document.createElement('div');
    checkboxField.className = 'csab-field';
    checkboxField.appendChild(checkboxRow);
    section.appendChild(checkboxField);

    // Output area for the resolved form values.
    const output: HTMLDivElement = document.createElement('div');
    output.className = 'csab-note';
    output.style.display = 'none';
    section.appendChild(output);

    // Actions
    const actions: HTMLDivElement = document.createElement('div');
    actions.className = 'csab-actions';

    const cancel: HTMLButtonElement = document.createElement('button');
    cancel.className = 'csab-btn csab-btn--default';
    cancel.type = 'button';
    cancel.textContent = 'Close';
    cancel.addEventListener('click', () => {
      this.close().catch(() => undefined);
    });

    const save: HTMLButtonElement = document.createElement('button');
    save.className = 'csab-btn csab-btn--primary';
    save.type = 'button';
    save.textContent = 'Resolve & show values';
    save.addEventListener('click', () => {
      save.disabled = true;
      save.textContent = 'Resolving…';
      output.style.display = '';
      output.textContent = 'Resolving selected people to site user ids…';

      // ensureUser proves the picker output is usable as a Person column value.
      this.picker
        ?.ensureSelectedUsers()
        .then((resolved) => {
          const people: string =
            resolved.length > 0
              ? resolved.map((r) => `${r.persona.displayName} (user id ${r.id})`).join(', ')
              : '(nobody selected)';

          output.textContent = [
            `Site contact: ${people}`,
            `Display name: ${textInput.value}`,
            `Business area: ${select.value}`,
            `Review date: ${date.value}`,
            `Notes: ${notes.value || '(empty)'}`,
            `Featured: ${checkbox.checked ? 'yes' : 'no'}`
          ].join('\n');
        })
        .catch((error: Error) => {
          output.textContent = `Could not resolve users: ${error.message}`;
        })
        .then(() => {
          save.disabled = false;
          save.textContent = 'Resolve & show values';
        })
        .catch(() => undefined);
    });

    actions.appendChild(cancel);
    actions.appendChild(save);
    section.appendChild(actions);

    return section;
  }

  /** The people currently chosen in the picker, for callers that need them. */
  public getSelectedPeople(): IPersonaResult[] {
    return this.picker?.getSelected() ?? [];
  }

  private static field(labelText: string, control: HTMLElement): HTMLDivElement {
    const wrapper: HTMLDivElement = document.createElement('div');
    wrapper.className = 'csab-field';
    const label: HTMLLabelElement = document.createElement('label');
    label.textContent = labelText;
    wrapper.appendChild(label);
    wrapper.appendChild(control);
    return wrapper;
  }

  private static formatDate(value: string | undefined): string {
    if (!value) return '—';
    const date: Date = new Date(value);
    return isNaN(date.getTime()) ? value : date.toLocaleString();
  }
}
