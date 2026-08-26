import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Plan, isPlan } from '../enums/plan';

/**
 * Bare `setMonth(getMonth() + n)` rolls a day that the target month does not
 * have into the following one — a plan bought on 31 January would expire on
 * 3 March, handing out two free days. Clamp to the last day of the target
 * month instead, which is what "one month later" means to the person paying.
 */
export function addMonths(from: Date, months: number): Date {
  const day = from.getDate();
  const target = new Date(from.getTime());
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

/**
 * The one place plan entitlement is written.
 *
 * There are two ways to get a plan — an admin granting it after a bank
 * transfer, and a settled QPay invoice — and both have to agree on what
 * "another month" means. Two copies of the extend-from-whichever-is-later rule
 * would eventually disagree, and the disagreement would be about something the
 * customer paid for.
 *
 * Entitlement is stored, never computed here: `PostService.effectivePlan()`
 * re-derives it on every read, so a lapsed plan degrades on its own.
 */
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async setPlan(
    userId: string,
    plan: string,
    months = 1,
  ): Promise<{ plan: string; plan_expires_at: Date | null }> {
    if (!isPlan(plan)) throw new BadRequestException('INVALID_PLAN');
    const clamped = Math.min(Math.max(Math.floor(months) || 1, 1), 24);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException(`User ${userId} not found`);
    user.plan = plan;
    if (plan === Plan.FREE) {
      user.plan_expires_at = null;
    } else {
      // Extend from whichever is later, so renewing early never burns time.
      const base =
        user.plan_expires_at && new Date(user.plan_expires_at) > new Date()
          ? new Date(user.plan_expires_at)
          : new Date();
      user.plan_expires_at = addMonths(base, clamped);
    }
    await this.userRepository.save(user);
    this.logger.log(
      `setPlan: ${userId} -> ${plan} until ${user.plan_expires_at?.toISOString() ?? 'n/a'}`,
    );
    return { plan: user.plan, plan_expires_at: user.plan_expires_at };
  }
}
