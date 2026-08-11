import { PeopleService, IPersonaResult, PrincipalType } from '../services/PeopleService';

export interface IPeoplePickerOptions {
  /** Allow more than one selection. Defaults to true. */
  multiSelect?: boolean;
  placeholder?: string;
  /** Restrict results to users, groups, etc. Defaults to all principals. */
  principalType?: PrincipalType;
  /** Fired whenever the selection changes. */
  onChange?: (selected: IPersonaResult[]) => void;
}

/**
 * A dependency-free people picker built on the same ClientPeoplePicker endpoint
 * SharePoint's own control uses. Renders into any container element, so it works
 * inside a dialog, a placeholder, or a web part alike.
 */
export class PeoplePicker {
  private static readonly DEBOUNCE_MS: number = 300;

  private readonly container: HTMLElement;
  private readonly service: PeopleService;
  private readonly options: IPeoplePickerOptions;

  private selected: IPersonaResult[] = [];
  private suggestions: IPersonaResult[] = [];
  private activeIndex: number = -1;
  private debounceHandle: number | undefined;
  private requestSequence: number = 0;

  private box!: HTMLDivElement;
  private input!: HTMLInputElement;
  private suggestionList!: HTMLDivElement;

  public constructor(
    container: HTMLElement,
    service: PeopleService,
    options: IPeoplePickerOptions = {}
  ) {
    this.container = container;
    this.service = service;
    this.options = { multiSelect: true, placeholder: 'Enter a name or email address', ...options };
    this.render();
  }

  /** The currently selected principals. */
  public getSelected(): IPersonaResult[] {
    return [...this.selected];
  }

  /**
   * Resolve every selection to a site user id, which is what a Person or Group
   * column needs before it can be written.
   */
  public async ensureSelectedUsers(): Promise<{ persona: IPersonaResult; id: number }[]> {
    const resolved: { persona: IPersonaResult; id: number }[] = [];
    for (const persona of this.selected) {
      const user = await this.service.ensureUser(persona.loginName);
      resolved.push({ persona, id: user.Id });
    }
    return resolved;
  }

  public dispose(): void {
    if (this.debounceHandle !== undefined) {
      window.clearTimeout(this.debounceHandle);
    }
    document.removeEventListener('click', this.onDocumentClick, true);
  }

  // ------------------------------------------------------------ rendering ---

  private render(): void {
    const wrapper: HTMLDivElement = document.createElement('div');
    wrapper.className = 'csab-picker';

    this.box = document.createElement('div');
    this.box.className = 'csab-picker-box';

    this.input = document.createElement('input');
    this.input.className = 'csab-picker-input';
    this.input.type = 'text';
    this.input.setAttribute('aria-label', 'People picker');
    this.input.setAttribute('autocomplete', 'off');
    this.input.placeholder = this.options.placeholder ?? '';

    this.input.addEventListener('input', () => this.onQueryChanged());
    this.input.addEventListener('keydown', (e: KeyboardEvent) => this.onKeyDown(e));

    this.suggestionList = document.createElement('div');
    this.suggestionList.className = 'csab-suggestions';
    this.suggestionList.style.display = 'none';

    this.box.appendChild(this.input);
    wrapper.appendChild(this.box);
    wrapper.appendChild(this.suggestionList);
    this.container.appendChild(wrapper);

    // Close the suggestion flyout when focus moves elsewhere on the page.
    document.addEventListener('click', this.onDocumentClick, true);
  }

  private onDocumentClick = (event: MouseEvent): void => {
    if (!this.container.contains(event.target as Node)) {
      this.hideSuggestions();
    }
  };

  private renderSelected(): void {
    // Remove existing chips but keep the input element in place.
    const chips = this.box.querySelectorAll('.csab-persona');
    chips.forEach((chip) => chip.remove());

    this.selected.forEach((persona, index) => {
      const chip: HTMLSpanElement = document.createElement('span');
      chip.className = 'csab-persona';

      const initials: HTMLSpanElement = document.createElement('span');
      initials.className = 'csab-persona-initials';
      initials.textContent = PeoplePicker.getInitials(persona.displayName);

      const name: HTMLSpanElement = document.createElement('span');
      name.className = 'csab-persona-name';
      name.textContent = persona.displayName;
      name.title = persona.email || persona.loginName;

      const remove: HTMLButtonElement = document.createElement('button');
      remove.className = 'csab-persona-remove';
      remove.type = 'button';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', `Remove ${persona.displayName}`);
      remove.addEventListener('click', () => {
        this.selected.splice(index, 1);
        this.renderSelected();
        this.options.onChange?.(this.getSelected());
      });

      chip.appendChild(initials);
      chip.appendChild(name);
      chip.appendChild(remove);
      this.box.insertBefore(chip, this.input);
    });

    const atLimit: boolean = !this.options.multiSelect && this.selected.length > 0;
    this.input.style.display = atLimit ? 'none' : '';
  }

  private renderSuggestions(message?: string): void {
    this.suggestionList.textContent = '';

    if (message) {
      const status: HTMLDivElement = document.createElement('div');
      status.className = 'csab-picker-status';
      status.textContent = message;
      this.suggestionList.appendChild(status);
      this.suggestionList.style.display = '';
      return;
    }

    if (this.suggestions.length === 0) {
      this.hideSuggestions();
      return;
    }

    this.suggestions.forEach((persona, index) => {
      const row: HTMLDivElement = document.createElement('div');
      row.className = `csab-suggestion${index === this.activeIndex ? ' csab-suggestion--active' : ''}`;

      const initials: HTMLSpanElement = document.createElement('span');
      initials.className = 'csab-persona-initials';
      initials.textContent = PeoplePicker.getInitials(persona.displayName);

      const text: HTMLDivElement = document.createElement('div');
      text.className = 'csab-suggestion-text';

      const name: HTMLSpanElement = document.createElement('span');
      name.className = 'csab-suggestion-name';
      name.textContent = persona.displayName;

      const mail: HTMLSpanElement = document.createElement('span');
      mail.className = 'csab-suggestion-mail';
      mail.textContent = persona.email || persona.entityType;

      text.appendChild(name);
      text.appendChild(mail);
      row.appendChild(initials);
      row.appendChild(text);

      // mousedown fires before the input's blur, so the click is not lost.
      row.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        this.select(persona);
      });

      this.suggestionList.appendChild(row);
    });

    this.suggestionList.style.display = '';
  }

  private hideSuggestions(): void {
    this.suggestionList.style.display = 'none';
    this.activeIndex = -1;
  }

  // -------------------------------------------------------------- behavior ---

  private onQueryChanged(): void {
    const query: string = this.input.value.trim();

    if (this.debounceHandle !== undefined) {
      window.clearTimeout(this.debounceHandle);
    }

    if (query.length < 2) {
      this.suggestions = [];
      this.hideSuggestions();
      return;
    }

    this.renderSuggestions('Searching…');

    this.debounceHandle = window.setTimeout(() => {
      const sequence: number = ++this.requestSequence;

      this.service
        .search(query, 15, this.options.principalType)
        .then((results) => {
          // Drop responses from searches the user has already typed past.
          if (sequence !== this.requestSequence) {
            return;
          }
          const chosen: string[] = this.selected.map((p) => p.loginName);
          this.suggestions = results.filter((r) => chosen.indexOf(r.loginName) < 0);
          this.activeIndex = this.suggestions.length > 0 ? 0 : -1;
          this.renderSuggestions(this.suggestions.length === 0 ? 'No results found' : undefined);
        })
        .catch((error: Error) => {
          if (sequence !== this.requestSequence) {
            return;
          }
          this.renderSuggestions(`Search failed: ${error.message}`);
        });
    }, PeoplePicker.DEBOUNCE_MS);
  }

  private onKeyDown(event: KeyboardEvent): void {
    const visible: boolean = this.suggestionList.style.display !== 'none';

    switch (event.key) {
      case 'ArrowDown':
        if (visible && this.suggestions.length > 0) {
          event.preventDefault();
          this.activeIndex = (this.activeIndex + 1) % this.suggestions.length;
          this.renderSuggestions();
        }
        break;
      case 'ArrowUp':
        if (visible && this.suggestions.length > 0) {
          event.preventDefault();
          this.activeIndex =
            (this.activeIndex - 1 + this.suggestions.length) % this.suggestions.length;
          this.renderSuggestions();
        }
        break;
      case 'Enter':
        if (visible && this.activeIndex >= 0) {
          event.preventDefault();
          this.select(this.suggestions[this.activeIndex]);
        }
        break;
      case 'Escape':
        this.hideSuggestions();
        break;
      case 'Backspace':
        if (this.input.value.length === 0 && this.selected.length > 0) {
          this.selected.pop();
          this.renderSelected();
          this.options.onChange?.(this.getSelected());
        }
        break;
      default:
        break;
    }
  }

  private select(persona: IPersonaResult): void {
    if (!this.options.multiSelect) {
      this.selected = [persona];
    } else if (this.selected.every((p) => p.loginName !== persona.loginName)) {
      this.selected.push(persona);
    }

    this.input.value = '';
    this.suggestions = [];
    this.hideSuggestions();
    this.renderSelected();
    this.options.onChange?.(this.getSelected());
    this.input.focus();
  }

  private static getInitials(displayName: string): string {
    const parts: string[] = (displayName || '?').split(/\s+/).filter((p) => p.length > 0);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
}
