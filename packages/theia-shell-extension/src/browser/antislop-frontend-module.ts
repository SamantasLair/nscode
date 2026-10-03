import {
  ContainerModule,
  type interfaces,
  FrontendApplicationContribution,
  WidgetFactory,
  CommandContribution,
  MenuContribution,
} from './theia-contracts.js';
import { AntislopWidget } from './antislop-widget.js';
import { AntislopLayoutContribution } from './antislop-layout-contribution.js';
import {
  AntislopCommandContribution,
  AntislopMenuContribution,
} from './antislop-commands.js';

export default new ContainerModule((bind: interfaces.Bind) => {
  // 1. Screen B Widget Singleton
  bind(AntislopWidget).toSelf().inSingletonScope();

  // 2. WidgetFactory for layout rehydration
  bind(WidgetFactory)
    .toDynamicValue((ctx: interfaces.Context) => ({
      id: AntislopWidget.ID,
      createWidget: () => ctx.container.get<AntislopWidget>(AntislopWidget),
    }))
    .inSingletonScope();

  // 3. Layout Contribution
  bind(AntislopLayoutContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AntislopLayoutContribution);

  // 4. Command & Menu Contributions
  bind(AntislopCommandContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(AntislopCommandContribution);

  bind(AntislopMenuContribution).toSelf().inSingletonScope();
  bind(MenuContribution).toService(AntislopMenuContribution);
});
