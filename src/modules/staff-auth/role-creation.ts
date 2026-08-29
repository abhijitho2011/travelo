import { hotelStaffRoleValues, type HotelStaffRole } from '../../database/schema';
import { roleHasPermission } from './role-permissions';

/**
 * WHO MAY CREATE WHOM — the server-side source of truth.
 *
 * This is a security rule, so it lives in one tested helper rather than in
 * conditionals scattered through the create handler. The mobile app mirrors it
 * in `staff_app/lib/core/permissions/role_config.dart` purely so the UI never
 * offers a role the API will reject; the app is not the authority.
 *
 * The matrix:
 *   GENERAL_MANAGER            → everything except GM and AGM (may create HR)
 *   ASSISTANT_GENERAL_MANAGER  → everything except GM and AGM (may create HR)
 *   HR                         → everything except GM, AGM and HR itself
 *   everyone else              → nothing (they hold no `staff.create` either)
 */

/**
 * Hotel management is appointed by the OWNER. No staff member, however senior,
 * may mint a peer or a superior for themselves from inside the property.
 */
const MANAGEMENT_ROLES: readonly HotelStaffRole[] = [
  'GENERAL_MANAGER',
  'ASSISTANT_GENERAL_MANAGER',
];

/**
 * The property-wide whitelist: every role that SOMEBODY inside the hotel may
 * create. It is the DTO's `@IsIn` list — the outer bound, not the per-actor
 * answer. `creatableRolesFor` narrows it further.
 */
export const staffCreatableRoleValues = hotelStaffRoleValues.filter(
  (r) => !(MANAGEMENT_ROLES as readonly string[]).includes(r),
);

/**
 * Roles the actor may narrow themselves out of. HR may not create another HR:
 * an HR account is a hiring authority, and letting HR clone itself would grow
 * that authority without a manager ever deciding to.
 */
const SELF_EXCLUDING_ACTORS: ReadonlySet<string> = new Set<string>(['HR']);

/**
 * Actors whose set is narrowed BEYOND the property-wide rule. A refusal for one
 * of these is `ROLE_NOT_PERMITTED` — the role is creatable by somebody, just not
 * by them. A GM/AGM reaching for management still gets the older, broader
 * `ROLE_NOT_ASSIGNABLE`, which the mobile app already branches on.
 */
export const ROLE_NARROWED_ACTORS: ReadonlySet<string> = SELF_EXCLUDING_ACTORS;

/**
 * Every role `actorRole` may create, narrowest-wins.
 *
 * An actor without `staff.create` gets an empty list, so the helper — not the
 * caller — is the single place that knows the answer. The permission guard on
 * the route already refuses them; this is the second lock on the same door.
 */
export function creatableRolesFor(actorRole: string): readonly HotelStaffRole[] {
  if (!roleHasPermission(actorRole, 'staff.create')) return [];
  if (SELF_EXCLUDING_ACTORS.has(actorRole)) {
    return staffCreatableRoleValues.filter((r) => r !== actorRole);
  }
  return staffCreatableRoleValues;
}

export function canCreateRole(actorRole: string, targetRole: string): boolean {
  return (creatableRolesFor(actorRole) as readonly string[]).includes(targetRole);
}
