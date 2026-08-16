import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

export function getAdminPhones(): string[] {
    return (process.env.ADMIN_PHONES ?? '')
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
}

export function isAdmin(phone: string): boolean {
    return getAdminPhones().includes(phone);
}

@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user || !isAdmin(user.phone_number)) {
            throw new ForbiddenException('Admin access required');
        }

        return true;
    }
}
