import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the tenant ID from the request.
 * In production this is injected from the validated Cognito JWT claim by API Gateway.
 * MVP stub reads the x-tenant-id header.
 */
export const CurrentTenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.headers['x-tenant-id'] ?? 'default';
});

/**
 * Extracts the authenticated customer ID from the request.
 * In production this comes from the validated JWT sub claim.
 * MVP stub reads the x-customer-id header.
 */
export const CurrentCustomerId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.headers['x-customer-id'] ?? 'anonymous';
});
