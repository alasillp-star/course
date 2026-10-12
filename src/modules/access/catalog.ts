import type { SystemRole } from "@/shared/enums";

/**
 * Permission catalogue — the single source of truth for what each role may do.
 * Checked on the server for every protected page, server action and API route
 * (hiding a button is never the control). Synchronised to the database by
 * `npm run db:seed` so permissions are also queryable for reports and the
 * staff-permissions screen.
 *
 * Pure module (no server imports) so the UI can use the same keys to decide
 * which navigation items to render.
 */
export const PERMISSIONS = {
  // Students & accounts
  "users.read": "View student accounts (name, e-mail, status, activity)",
  "users.read_sensitive": "View phone numbers, IP addresses and device details",
  "users.suspend": "Suspend and reactivate accounts",
  "users.sessions.manage": "View and revoke a user's sessions and devices",
  "users.email.change": "Change a user's e-mail during verified account recovery",
  "users.export": "Export a user's personal data (data-portability requests)",
  "users.delete": "Anonymise (delete) a user account",

  // Staff & access control
  "staff.read": "View staff members and their roles",
  "staff.manage": "Grant or revoke staff roles (except Super Admin)",
  "roles.manage": "Create custom roles, grant Super Admin, edit role permissions",

  // Course access
  "entitlements.read": "View students' course access",
  "entitlements.grant": "Manually grant course access",
  "entitlements.revoke": "Revoke course access",

  // QR activation cards
  "activation.batches.read": "View card batches and their statistics",
  "activation.batches.create": "Generate new card batches",
  "activation.codes.read": "Look up cards by serial and see their lifecycle",
  "activation.codes.export": "Download printable cards and printer files (contain secrets)",
  "activation.codes.sell": "Mark cards as sold / link them to orders",
  "activation.codes.revoke": "Revoke cards and issue replacements",
  "activation.codes.unlock": "Unlock cards locked after failed PIN attempts",
  "activation.batches.finalize": "Finalise a batch and purge printable secrets",
  "activation.templates.manage": "Customise the printed card design",
  "printing.queue":
    "Print queue: print the personalised card of each confirmed order (sees the recipient's name only)",

  // Content
  "content.read": "View unpublished content and the course editor",
  "content.manage": "Create and edit modules, lessons and resources",
  "content.publish": "Publish, hide and schedule content",
  "media.manage": "Upload and manage videos and files",

  // Learning & assessments
  "progress.read": "View students' learning progress",
  "assessments.manage": "Create and edit quizzes and assignments",
  "submissions.grade": "Review and grade assignment submissions",
  "certificates.read": "View issued certificates",
  "certificates.issue": "Issue certificates",
  "certificates.revoke": "Revoke certificates",

  // Community
  "community.participate": "Post, comment and react in the community",
  "community.moderate": "Hide or remove content, handle reports, ban members",
  "community.pin": "Pin posts",
  "community.announce": "Post in the Announcements space",
  "community.verify_answer": "Mark a reply as the verified answer",
  "community.moderators.manage": "Assign community moderators",

  // Live sessions
  "live.manage": "Schedule live sessions and manage seats",
  "live.host": "Host live sessions and see all join links",

  // Sales & finance
  "orders.read": "View orders and customers",
  "orders.manage": "Create and update orders, pack cards into parcels, import carrier statuses",
  "orders.delivery.override":
    "Set a parcel's delivery status by hand (bypasses the carrier: unlocks or re-locks cards)",
  "payments.read": "View payments",
  "payments.record": "Record offline payments",
  "refunds.request": "Request refunds",
  "refunds.approve": "Approve or reject refunds",
  "discounts.manage": "Manage discount codes",
  "invoices.read": "View and download invoices",
  "finance.reports.read": "View revenue and sales reports",
  "sales.scope_all": "See every seller's sales (otherwise only one's own)",

  // Support
  "support.tickets.read": "View support tickets",
  "support.tickets.manage": "Reply to, assign and close support tickets",

  // Reports & platform
  "reports.read": "View activation, engagement and learning reports",
  "reports.export": "Export report data",
  "settings.read": "View platform settings",
  "settings.manage": "Change platform settings",
  "audit.read": "View the audit log",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

const ADMIN_EXCLUDED: readonly Permission[] = ["roles.manage"];

/**
 * Role -> permissions matrix for the built-in roles.
 *  - super_admin: everything.
 *  - admin: everything except role management / granting Super Admin.
 *  - instructor: content, assessments, live sessions, learning progress.
 *  - moderator: community moderation only.
 *  - support_agent: account support; no sales, finance or staff management.
 *  - sales_agent: card sales and orders; no PII beyond customers, no admin.
 *  - print_operator: the card print queue only (recipient names, nothing else).
 *  - student: community participation (course access comes from entitlements).
 */
export const ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((permission) => !ADMIN_EXCLUDED.includes(permission)),
  instructor: [
    "users.read",
    "progress.read",
    "entitlements.read",
    "content.read",
    "content.manage",
    "content.publish",
    "media.manage",
    "assessments.manage",
    "submissions.grade",
    "certificates.read",
    "certificates.issue",
    "community.participate",
    "community.pin",
    "community.announce",
    "community.verify_answer",
    "live.manage",
    "live.host",
    "reports.read",
  ],
  moderator: ["users.read", "community.participate", "community.moderate", "community.pin"],
  support_agent: [
    "users.read",
    "users.sessions.manage",
    "entitlements.read",
    "activation.codes.read",
    "activation.codes.unlock",
    "progress.read",
    "certificates.read",
    "support.tickets.read",
    "support.tickets.manage",
  ],
  sales_agent: [
    "activation.batches.read",
    "activation.codes.read",
    "activation.codes.sell",
    "orders.read",
    "orders.manage",
    "payments.read",
    "payments.record",
    "refunds.request",
    "invoices.read",
  ],
  print_operator: ["printing.queue"],
  student: ["community.participate"],
};

export const ROLE_LABELS: Record<SystemRole, { name: string; description: string }> = {
  super_admin: { name: "Super Admin", description: "Full control, including roles and staff" },
  admin: { name: "Admin", description: "Runs the academy day to day" },
  instructor: { name: "Instructor", description: "Creates content, grades work, hosts sessions" },
  moderator: { name: "Moderator", description: "Keeps the community healthy" },
  support_agent: { name: "Support Agent", description: "Helps students with access and accounts" },
  sales_agent: { name: "Sales Agent", description: "Sells activation cards and records payments" },
  print_operator: {
    name: "Print Operator",
    description: "Prints the personalised activation cards of confirmed orders",
  },
  student: { name: "Student", description: "Learner account" },
};
