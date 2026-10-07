import {
  type FrontendApplicationContribution,
  type FrontendApplication,
  type ApplicationShell,
} from './theia-contracts.js';
import { AntislopWidget } from './antislop-widget.js';

export class AntislopLayoutContribution
  implements FrontendApplicationContribution
{
  constructor(
    private readonly shell: ApplicationShell,
    private readonly widget: AntislopWidget
  ) {}

  /**
   * Lifecycle hook: executed when Theia shell boots up.
   * Enforces persistent 50:50 dual-screen layout with Screen A left and Screen B right.
   */
  public async onStart(_app: FrontendApplication): Promise<void> {
    await this.ensureDualScreenLayout();
  }

  /**
   * Docks AntislopWidget in area: 'main' with mode: 'split-right' if not already docked.
   */
  public async ensureDualScreenLayout(): Promise<boolean> {
    const mainWidgets = this.shell.getWidgets('main');
    const isAttached = mainWidgets.some((w) => w.id === AntislopWidget.ID);

    if (isAttached) {
      return false;
    }

    const refWidget = mainWidgets.find((w) => w.id !== AntislopWidget.ID);

    await this.shell.addWidget(this.widget, {
      area: 'main',
      mode: 'split-right',
      ref: refWidget,
    });

    this.widget.isAttached = true;
    return true;
  }

  /**
   * Command helper to reset layout to strict 50:50 split.
   */
  public async resetLayout(): Promise<void> {
    const mainWidgets = this.shell.getWidgets('main');
    const isAttached = mainWidgets.some((w) => w.id === AntislopWidget.ID);

    if (isAttached) {
      this.shell.closeWidget(AntislopWidget.ID);
    }

    await this.ensureDualScreenLayout();
  }

  public getWidget(): AntislopWidget {
    return this.widget;
  }
}
