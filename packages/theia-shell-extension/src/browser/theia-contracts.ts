/**
 * Clean, mockable TypeScript contracts mirroring Eclipse Theia & Lumino APIs.
 * Enables zero-dependency compilation and millisecond-level Vitest testing.
 */

export type MaybePromise<T> = T | Promise<T>;

export interface IDisposable {
  dispose(): void;
}

export type Event<T> = (listener: (e: T) => any) => IDisposable;

export class Emitter<T> implements IDisposable {
  private listeners: Array<(e: T) => any> = [];

  public get event(): Event<T> {
    return (listener: (e: T) => any): IDisposable => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          const idx = this.listeners.indexOf(listener);
          if (idx !== -1) this.listeners.splice(idx, 1);
        },
      };
    };
  }

  public fire(event: T): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  public dispose(): void {
    this.listeners = [];
  }
}

export interface Title<T> {
  label: string;
  caption: string;
  iconClass: string;
  closable: boolean;
  owner: T;
}

export class Message {
  constructor(public readonly type: string) {}
}

export class MockHTMLElement {
  public id: string = '';
  public className: string = '';
  public classList = {
    add: (cls: string) => {
      const set = new Set(this.className.split(' ').filter(Boolean));
      set.add(cls);
      this.className = Array.from(set).join(' ');
    },
    remove: (cls: string) => {
      const set = new Set(this.className.split(' ').filter(Boolean));
      set.delete(cls);
      this.className = Array.from(set).join(' ');
    },
    contains: (cls: string) => {
      const set = new Set(this.className.split(' ').filter(Boolean));
      return set.has(cls);
    },
  };
  public style: Record<string, string> = {};
  public children: MockHTMLElement[] = [];

  public appendChild<T extends MockHTMLElement>(child: T): T {
    this.children.push(child);
    return child;
  }

  public removeChild<T extends MockHTMLElement>(child: T): T {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
    }
    return child;
  }
}

export class Widget implements IDisposable {
  public id: string = '';
  public readonly title: Title<Widget>;
  public readonly node: HTMLElement;
  public isAttached: boolean = false;
  public isVisible: boolean = true;
  public isDisposed: boolean = false;
  private classes: Set<string> = new Set();

  constructor() {
    this.title = {
      label: '',
      caption: '',
      iconClass: '',
      closable: true,
      owner: this,
    };
    this.node =
      typeof document !== 'undefined' && document.createElement
        ? document.createElement('div')
        : (new MockHTMLElement() as unknown as HTMLElement);
  }

  public addClass(className: string): void {
    this.classes.add(className);
    if (this.node && this.node.classList) {
      this.node.classList.add(className);
    }
  }

  public removeClass(className: string): void {
    this.classes.delete(className);
    if (this.node && this.node.classList) {
      this.node.classList.remove(className);
    }
  }

  public hasClass(className: string): boolean {
    return this.classes.has(className);
  }

  public close(): void {
    this.onCloseRequest(Widget.Msg.CloseRequest);
  }

  protected onCloseRequest(_msg: Message): void {
    this.dispose();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.isAttached = false;
  }
}

export namespace Widget {
  export class ResizeMessage extends Message {
    constructor(
      public readonly width: number,
      public readonly height: number
    ) {
      super('resize');
    }
  }

  export const Msg = {
    CloseRequest: new Message('close-request'),
    AfterAttach: new Message('after-attach'),
    BeforeDetach: new Message('before-detach'),
  };
}

export class BaseWidget extends Widget {}

export namespace ApplicationShell {
  export type Area = 'main' | 'left' | 'right' | 'bottom' | 'top';

  export interface WidgetOptions {
    area?: Area;
    mode?:
      | 'split-right'
      | 'split-left'
      | 'split-top'
      | 'split-bottom'
      | 'tab-after'
      | 'tab-before';
    ref?: Widget;
    rank?: number;
  }
}

export interface ApplicationShell {
  readonly currentWidget: Widget | undefined;
  getWidgets(area?: ApplicationShell.Area): Widget[];
  addWidget(
    widget: Widget,
    options?: ApplicationShell.WidgetOptions
  ): Promise<void> | void;
  activateWidget(id: string): void;
  closeWidget(id: string): void;
}
export const ApplicationShell = Symbol('ApplicationShell');

export interface FrontendApplication {
  readonly shell: ApplicationShell;
  start(): Promise<void>;
}
export const FrontendApplication = Symbol('FrontendApplication');

export interface FrontendApplicationContribution {
  initialize?(): void;
  configure?(app: FrontendApplication): void;
  onStart?(app: FrontendApplication): MaybePromise<void>;
  onStop?(app: FrontendApplication): void;
}
export const FrontendApplicationContribution = Symbol(
  'FrontendApplicationContribution'
);

export interface WidgetFactory {
  readonly id: string;
  createWidget(options?: any): MaybePromise<Widget>;
}
export const WidgetFactory = Symbol('WidgetFactory');

export interface Command {
  id: string;
  label?: string;
  category?: string;
  iconClass?: string;
}

export interface CommandHandler {
  execute(...args: any[]): any;
  isEnabled?(...args: any[]): boolean;
  isVisible?(...args: any[]): boolean;
}

export interface CommandRegistry {
  registerCommand(command: Command, handler?: CommandHandler): IDisposable;
}
export const CommandRegistry = Symbol('CommandRegistry');

export interface CommandContribution {
  registerCommands(commands: CommandRegistry): void;
}
export const CommandContribution = Symbol('CommandContribution');

export interface MenuModelRegistry {
  registerMenuAction(
    menuPath: string[],
    item: { commandId: string; label?: string; order?: string }
  ): IDisposable;
}
export const MenuModelRegistry = Symbol('MenuModelRegistry');

export interface MenuContribution {
  registerMenus(menus: MenuModelRegistry): void;
}
export const MenuContribution = Symbol('MenuContribution');

export namespace interfaces {
  export type ServiceIdentifier<T = any> =
    | string
    | symbol
    | (new (...args: any[]) => T);
  export interface Context {
    container: Container;
  }
  export interface BindingWhenOnSyntax<T> {
    inSingletonScope(): void;
  }
  export interface BindingInWhenOnSyntax<T> extends BindingWhenOnSyntax<T> {}
  export interface BindingToSyntax<T> {
    to(constructor: new (...args: any[]) => T): BindingInWhenOnSyntax<T>;
    toSelf(): BindingInWhenOnSyntax<T>;
    toService(service: ServiceIdentifier<T>): void;
    toDynamicValue(func: (context: Context) => T): BindingInWhenOnSyntax<T>;
    toConstantValue(value: T): BindingWhenOnSyntax<T>;
  }
  export type Bind = <T>(
    serviceIdentifier: ServiceIdentifier<T>
  ) => BindingToSyntax<T>;
  export type Unbind = (serviceIdentifier: ServiceIdentifier) => void;
  export type IsBound = (serviceIdentifier: ServiceIdentifier) => boolean;
  export type Rebind = <T>(
    serviceIdentifier: ServiceIdentifier<T>
  ) => BindingToSyntax<T>;

  export interface Container {
    get<T>(serviceIdentifier: ServiceIdentifier<T>): T;
    bind<T>(serviceIdentifier: ServiceIdentifier<T>): BindingToSyntax<T>;
    isBound(serviceIdentifier: ServiceIdentifier): boolean;
  }
}

export class ContainerModule {
  constructor(
    public readonly id: (
      bind: interfaces.Bind,
      unbind: interfaces.Unbind,
      isBound: interfaces.IsBound,
      rebind: interfaces.Rebind
    ) => void
  ) {}
}
