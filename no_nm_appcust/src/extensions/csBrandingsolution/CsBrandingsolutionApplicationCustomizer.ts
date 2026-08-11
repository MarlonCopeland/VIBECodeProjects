import { Log } from '@microsoft/sp-core-library';
import {
  BaseApplicationCustomizer,
  PlaceholderContent,
  PlaceholderName
} from '@microsoft/sp-application-base';

import * as strings from 'CsBrandingsolutionApplicationCustomizerStrings';

import { injectStyles } from './styles/injectStyles';
import { TopBreadcrumbBar } from './components/TopBreadcrumbBar';
import { BottomLinkBar } from './components/BottomLinkBar';

const LOG_SOURCE: string = 'CsBrandingsolutionApplicationCustomizer';

/** Default source list for the footer links when none is configured. */
const DEFAULT_FOOTER_LIST: string = 'CSAB Footer Links';

/**
 * Properties supplied through the ClientSideComponentProperties JSON blob,
 * either in config/serve.json while debugging or on the custom action once
 * the solution is deployed.
 */
export interface ICsBrandingsolutionApplicationCustomizerProperties {
  testMessage?: string;
  /** Title of the list that supplies the footer links. */
  footerListTitle?: string;
  /** Maximum number of links to render in the footer. */
  maxFooterLinks?: number;
}

/** A Custom Action which can be run during execution of a Client Side Application */
export default class CsBrandingsolutionApplicationCustomizer extends BaseApplicationCustomizer<ICsBrandingsolutionApplicationCustomizerProperties> {
  private topPlaceholder: PlaceholderContent | undefined;
  private bottomPlaceholder: PlaceholderContent | undefined;

  public onInit(): Promise<void> {
    Log.info(LOG_SOURCE, `Initialized ${strings.Title}`);

    injectStyles();

    // Placeholders come and go as the user navigates in-place, so react to the
    // change event as well as rendering once on load.
    this.context.placeholderProvider.changedEvent.add(this, this.renderPlaceholders);
    this.renderPlaceholders();

    return Promise.resolve();
  }

  private renderPlaceholders(): void {
    this.renderTop();
    this.renderBottom();
  }

  private renderTop(): void {
    if (!this.topPlaceholder) {
      this.topPlaceholder = this.context.placeholderProvider.tryCreateContent(PlaceholderName.Top, {
        onDispose: this.onTopDisposed
      });
    }

    const host: HTMLElement | undefined = this.topPlaceholder?.domElement;
    if (!host) {
      Log.info(LOG_SOURCE, 'Top placeholder is not available on this page.');
      return;
    }

    new TopBreadcrumbBar(host, this.context).render().catch((error: Error) => {
      Log.error(LOG_SOURCE, error);
    });
  }

  private renderBottom(): void {
    if (!this.bottomPlaceholder) {
      this.bottomPlaceholder = this.context.placeholderProvider.tryCreateContent(
        PlaceholderName.Bottom,
        { onDispose: this.onBottomDisposed }
      );
    }

    const host: HTMLElement | undefined = this.bottomPlaceholder?.domElement;
    if (!host) {
      Log.info(LOG_SOURCE, 'Bottom placeholder is not available on this page.');
      return;
    }

    const listTitle: string = this.properties.footerListTitle || DEFAULT_FOOTER_LIST;
    const maxLinks: number = this.properties.maxFooterLinks ?? 8;

    new BottomLinkBar(host, this.context, listTitle, maxLinks).render().catch((error: Error) => {
      Log.error(LOG_SOURCE, error);
    });
  }

  private onTopDisposed = (): void => {
    this.topPlaceholder = undefined;
  };

  private onBottomDisposed = (): void => {
    this.bottomPlaceholder = undefined;
  };

  protected onDispose(): void {
    this.context.placeholderProvider.changedEvent.remove(this, this.renderPlaceholders);
    super.onDispose();
  }
}
