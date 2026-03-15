import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const WPUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.wpUser;
  },
);
