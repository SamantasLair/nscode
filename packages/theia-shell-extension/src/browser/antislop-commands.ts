import {
  type CommandContribution,
  type CommandRegistry,
  type MenuContribution,
  type MenuModelRegistry,
  type Command,
  type ApplicationShell,
} from './theia-contracts.js';
import { AntislopLayoutContribution } from './antislop-layout-contribution.js';
import { AntislopWidget } from './antislop-widget.js';

export namespace AntislopCommands {
  export const RESET_LAYOUT: Command = {
    id: 'antislop.resetLayout',
    label: 'AntiSlop: Reset Dual-Screen Split (50:50)',
    category: 'AntiSlop',
  };

  export const FOCUS_SCREEN_B: Command = {
    id: 'antislop.focusScreenB',
    label: 'AntiSlop: Focus Screen B (Diagnostics)',
    category: 'AntiSlop',
  };
}

export class AntislopCommandContribution implements CommandContribution {
  constructor(
    private readonly layoutContribution: AntislopLayoutContribution,
    private readonly shell: ApplicationShell
  ) {}

  public registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(AntislopCommands.RESET_LAYOUT, {
      execute: () => this.layoutContribution.resetLayout(),
    });

    commands.registerCommand(AntislopCommands.FOCUS_SCREEN_B, {
      execute: () => this.shell.activateWidget(AntislopWidget.ID),
    });
  }
}

export class AntislopMenuContribution implements MenuContribution {
  public registerMenus(menus: MenuModelRegistry): void {
    menus.registerMenuAction(['view'], {
      commandId: AntislopCommands.RESET_LAYOUT.id,
      label: 'AntiSlop: Reset Dual-Screen Split',
      order: 'a10',
    });

    menus.registerMenuAction(['view'], {
      commandId: AntislopCommands.FOCUS_SCREEN_B.id,
      label: 'AntiSlop: Focus Screen B',
      order: 'a11',
    });
  }
}
