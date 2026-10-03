import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AntislopWidget,
  AntislopLayoutContribution,
  AntislopCommands,
  AntislopCommandContribution,
  AntislopMenuContribution,
  antislopFrontendModule,
  Widget,
  FrontendApplicationContribution,
  WidgetFactory,
  CommandContribution,
  MenuContribution,
  type ApplicationShell,
  type CommandRegistry,
  type MenuModelRegistry,
  type CommandHandler,
  type FrontendApplication,
  type interfaces,
} from '../src/index.js';
import type {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from '@antislop/protocol';

class MockApplicationShell implements ApplicationShell {
  public widgets: Map<string, Widget[]> = new Map();
  public currentWidget: Widget | undefined = undefined;
  public activatedWidgets: string[] = [];
  public closedWidgets: string[] = [];
  public addWidgetCalls: Array<{ widget: Widget; options?: ApplicationShell.WidgetOptions }> = [];

  constructor() {
    this.widgets.set('main', []);
  }

  getWidgets(area: ApplicationShell.Area = 'main'): Widget[] {
    return this.widgets.get(area) ?? [];
  }

  addWidget(widget: Widget, options?: ApplicationShell.WidgetOptions): void {
    this.addWidgetCalls.push({ widget, options });
    const area = options?.area ?? 'main';
    const list = this.widgets.get(area) ?? [];
    if (!list.includes(widget)) {
      list.push(widget);
      this.widgets.set(area, list);
    }
    widget.isAttached = true;
  }

  activateWidget(id: string): void {
    this.activatedWidgets.push(id);
  }

  closeWidget(id: string): void {
    this.closedWidgets.push(id);
    for (const [area, list] of this.widgets.entries()) {
      const idx = list.findIndex((w) => w.id === id);
      if (idx !== -1) {
        list.splice(idx, 1);
        this.widgets.set(area, list);
      }
    }
  }
}

class MockCommandRegistry implements CommandRegistry {
  public registeredCommands = new Map<string, CommandHandler>();

  registerCommand(command: { id: string }, handler?: CommandHandler) {
    if (handler) {
      this.registeredCommands.set(command.id, handler);
    }
    return {
      dispose: () => {
        this.registeredCommands.delete(command.id);
      },
    };
  }
}

class MockMenuModelRegistry implements MenuModelRegistry {
  public registeredActions: Array<{ menuPath: string[]; item: any }> = [];

  registerMenuAction(menuPath: string[], item: any) {
    this.registeredActions.push({ menuPath, item });
    return {
      dispose: () => {},
    };
  }
}

describe('Theia Shell Extension: Screen B Unclosable Widget & Docking Isolation', () => {
  describe('AntislopWidget (Screen B Unclosable Container)', () => {
    it('initializes with correct ID, label, and custom classes', () => {
      const widget = new AntislopWidget({ webviewUrl: 'http://127.0.0.1:5173' });
      expect(widget.id).toBe(AntislopWidget.ID);
      expect(widget.title.label).toBe(AntislopWidget.LABEL);
      expect(widget.hasClass('antislop-screen-b-container')).toBe(true);
      expect(widget.getWebviewUrl()).toBe('http://127.0.0.1:5173');
    });

    it('INVIOLABLE: enforces title.closable === false against accidental UI closure', () => {
      const widget = new AntislopWidget();
      expect(widget.title.closable).toBe(false);
    });

    it('INVIOLABLE: swallows close requests without disposing or detaching', () => {
      const widget = new AntislopWidget();
      expect(widget.isDisposed).toBe(false);
      expect(widget.closeAttemptCount).toBe(0);

      // Attempt to close via standard Lumino widget.close()
      widget.close();

      expect(widget.closeAttemptCount).toBe(1);
      expect(widget.isDisposed).toBe(false);

      // Multiple close attempts must all be swallowed
      widget.close();
      widget.close();
      expect(widget.closeAttemptCount).toBe(3);
      expect(widget.isDisposed).toBe(false);
    });

    it('creates an iframe element with security sandbox attributes', () => {
      const widget = new AntislopWidget({ webviewUrl: 'http://localhost:3000/diagnostics' });
      const iframe = widget.getIframe();
      expect(iframe).not.toBeNull();
      expect((iframe as any).src).toBe('http://localhost:3000/diagnostics');
      
      const sandboxStr = typeof (iframe as any).sandbox === 'string'
        ? (iframe as any).sandbox
        : (iframe as any).sandbox?.value ?? '';
      
      expect(sandboxStr).toContain('allow-scripts');
      expect(sandboxStr).toContain('allow-same-origin');
      expect(sandboxStr).toContain('allow-forms');
      expect(sandboxStr).toContain('allow-popups');
    });

    it('posts typed ExtensionToWebviewMessage to iframe contentWindow', () => {
      const widget = new AntislopWidget();
      const iframe = widget.getIframe() as any;
      const postMessageSpy = vi.fn();
      iframe.contentWindow = { postMessage: postMessageSpy };

      const msg: ExtensionToWebviewMessage = {
        type: 'SET_ACTIVE_FILE',
        payload: { fileUri: 'file:///workspace/main.ts', languageId: 'typescript' },
      };

      const result = widget.postMessage(msg);
      expect(result).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(msg, '*');
    });

    it('fires onMessage event when valid WebviewToExtensionMessage is received', async () => {
      const widget = new AntislopWidget();
      const iframe = widget.getIframe() as any;
      const mockContentWindow = {};
      iframe.contentWindow = mockContentWindow;

      const received: WebviewToExtensionMessage[] = [];
      const disposable = widget.onMessage((msg) => {
        received.push(msg);
      });

      // Simulate window.dispatchEvent(new MessageEvent(...))
      const validMsg: WebviewToExtensionMessage = {
        type: 'HIGHLIGHT_LINE',
        payload: { fileUri: 'file:///workspace/app.ts', line: 42 },
      };

      // Call private listener or trigger window event
      if (typeof window !== 'undefined') {
        const event = new MessageEvent('message', {
          data: validMsg,
          source: mockContentWindow as any,
        });
        window.dispatchEvent(event);
        expect(received).toHaveLength(1);
        expect(received[0]).toEqual(validMsg);
      }

      disposable.dispose();
      widget.dispose();
    });
  });

  describe('AntislopLayoutContribution (Lumino 50:50 Docking)', () => {
    let shell: MockApplicationShell;
    let widget: AntislopWidget;
    let contribution: AntislopLayoutContribution;

    beforeEach(() => {
      shell = new MockApplicationShell();
      widget = new AntislopWidget();
      contribution = new AntislopLayoutContribution(shell, widget);
    });

    it('docks AntislopWidget into area: "main" with mode: "split-right" on boot (onStart)', async () => {
      // Mock existing editor widget (Screen A)
      const editorScreenA = new Widget();
      editorScreenA.id = 'editor-screen-a';
      shell.addWidget(editorScreenA, { area: 'main' });

      expect(shell.getWidgets('main')).toHaveLength(1);

      await contribution.onStart({ shell } as FrontendApplication);

      expect(shell.addWidgetCalls).toHaveLength(2); // 1 for editor, 1 for Screen B
      const dockCall = shell.addWidgetCalls[1];
      expect(dockCall.widget).toBe(widget);
      expect(dockCall.options?.area).toBe('main');
      expect(dockCall.options?.mode).toBe('split-right');
      expect(dockCall.options?.ref).toBe(editorScreenA);
      expect(widget.isAttached).toBe(true);
    });

    it('does not re-add widget if it is already docked in main area', async () => {
      await contribution.ensureDualScreenLayout();
      expect(shell.addWidgetCalls).toHaveLength(1);

      // Second call should detect already attached and return false
      const secondCallResult = await contribution.ensureDualScreenLayout();
      expect(secondCallResult).toBe(false);
      expect(shell.addWidgetCalls).toHaveLength(1);
    });

    it('resets layout to 50:50 split upon resetLayout command', async () => {
      await contribution.ensureDualScreenLayout();
      expect(shell.getWidgets('main')).toContain(widget);

      await contribution.resetLayout();

      expect(shell.closedWidgets).toContain(AntislopWidget.ID);
      expect(shell.addWidgetCalls.length).toBeGreaterThanOrEqual(2);
      const latestCall = shell.addWidgetCalls[shell.addWidgetCalls.length - 1];
      expect(latestCall.widget).toBe(widget);
      expect(latestCall.options?.area).toBe('main');
      expect(latestCall.options?.mode).toBe('split-right');
    });
  });

  describe('Antislop Commands & Menus', () => {
    let shell: MockApplicationShell;
    let widget: AntislopWidget;
    let layoutContribution: AntislopLayoutContribution;
    let commandContribution: AntislopCommandContribution;
    let menuContribution: AntislopMenuContribution;
    let commandRegistry: MockCommandRegistry;
    let menuRegistry: MockMenuModelRegistry;

    beforeEach(() => {
      shell = new MockApplicationShell();
      widget = new AntislopWidget();
      layoutContribution = new AntislopLayoutContribution(shell, widget);
      commandContribution = new AntislopCommandContribution(layoutContribution, shell);
      menuContribution = new AntislopMenuContribution();
      commandRegistry = new MockCommandRegistry();
      menuRegistry = new MockMenuModelRegistry();
    });

    it('registers antislop.resetLayout and executes layout reset', async () => {
      commandContribution.registerCommands(commandRegistry);

      expect(commandRegistry.registeredCommands.has(AntislopCommands.RESET_LAYOUT.id)).toBe(true);
      expect(commandRegistry.registeredCommands.has(AntislopCommands.FOCUS_SCREEN_B.id)).toBe(true);

      const resetHandler = commandRegistry.registeredCommands.get(AntislopCommands.RESET_LAYOUT.id)!;
      const resetSpy = vi.spyOn(layoutContribution, 'resetLayout');

      await resetHandler.execute();
      expect(resetSpy).toHaveBeenCalled();
    });

    it('registers antislop.focusScreenB and activates widget in shell', async () => {
      commandContribution.registerCommands(commandRegistry);
      const focusHandler = commandRegistry.registeredCommands.get(AntislopCommands.FOCUS_SCREEN_B.id)!;

      await focusHandler.execute();
      expect(shell.activatedWidgets).toContain(AntislopWidget.ID);
    });

    it('registers menu actions for view menu', () => {
      menuContribution.registerMenus(menuRegistry);

      expect(menuRegistry.registeredActions).toHaveLength(2);
      expect(menuRegistry.registeredActions[0].item.commandId).toBe(AntislopCommands.RESET_LAYOUT.id);
      expect(menuRegistry.registeredActions[1].item.commandId).toBe(AntislopCommands.FOCUS_SCREEN_B.id);
    });
  });

  describe('Antislop DI Container Module', () => {
    it('binds all contributions, widgets, and factories cleanly', () => {
      const bindings = new Map<any, any>();
      const boundServices = new Set<any>();

      const mockBind: interfaces.Bind = (serviceId) => {
        boundServices.add(serviceId);
        const syntax: any = {
          to: (_target: any) => syntax,
          toSelf: () => syntax,
          toService: (s: any) => {
            boundServices.add(s);
          },
          toDynamicValue: (fn: any) => {
            bindings.set(serviceId, fn);
            return syntax;
          },
          inSingletonScope: () => syntax,
        };
        return syntax;
      };

      antislopFrontendModule.id(
        mockBind,
        vi.fn() as any,
        vi.fn() as any,
        vi.fn() as any
      );

      expect(boundServices.has(AntislopWidget)).toBe(true);
      expect(boundServices.has(WidgetFactory)).toBe(true);
      expect(boundServices.has(AntislopLayoutContribution)).toBe(true);
      expect(boundServices.has(FrontendApplicationContribution)).toBe(true);
      expect(boundServices.has(AntislopCommandContribution)).toBe(true);
      expect(boundServices.has(CommandContribution)).toBe(true);
      expect(boundServices.has(AntislopMenuContribution)).toBe(true);
      expect(boundServices.has(MenuContribution)).toBe(true);

      // Verify WidgetFactory produces AntislopWidget
      const factoryFn = bindings.get(WidgetFactory);
      expect(factoryFn).toBeDefined();

      const mockContainer = {
        get: vi.fn().mockReturnValue(new AntislopWidget()),
      };
      const factory = factoryFn({ container: mockContainer });
      expect(factory.id).toBe(AntislopWidget.ID);
      const createdWidget = factory.createWidget();
      expect(createdWidget).toBeInstanceOf(AntislopWidget);
    });
  });
});
