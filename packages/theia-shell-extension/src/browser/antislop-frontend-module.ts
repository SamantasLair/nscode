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
  bind(AntislopWidget).toSelf().inSingletonScope();

  bind(WidgetFactory)
    .toDynamicValue((ctx: interfaces.Context) => ({
      id: AntislopWidget.ID,
      createWidget: () => ctx.container.get<AntislopWidget>(AntislopWidget),
    }))
    .inSingletonScope();

  bind(AntislopLayoutContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AntislopLayoutContribution);

  bind(AntislopCommandContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(AntislopCommandContribution);

  bind(AntislopMenuContribution).toSelf().inSingletonScope();
  bind(MenuContribution).toService(AntislopMenuContribution);
});
