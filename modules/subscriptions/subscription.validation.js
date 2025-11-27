import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";

// 🔹 Fetch all active plans
export async function getActivePlansRepo() {
  return prisma.tbl_subscription_plans.findMany({
    where: { is_active: true },
    orderBy: { price_monthly: "asc" },
    select: {
      plan_uuid: true,
      plan_name: true,
      plan_description: true,
      price_monthly: true,
      price_yearly: true,
      duration_days: true,
      is_trial: true,
      is_active: true,
      created_on: true,
    },
  });
}

// 🔹 Fetch plan by UUID with its menus
export async function getPlanDetailsRepo(planUuid) {
  return prisma.tbl_subscription_plans.findUnique({
    where: { plan_uuid: planUuid },
    include: {
      tbl_plan_menus: {
        include: { tbl_menus: { select: { menu_name: true, path: true } } },
      },
    },
  });
}

// 🔹 Create a new subscription record (pending or free trial)
export async function createTenantSubscriptionRepo({
  tentUuid,
  planUuid,
  isTrial = false,
  paymentStatus = "PENDING",
  isAutoRenew = true,
}) {
  const tenant = await prisma.tbl_tent_master.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  const plan = await prisma.tbl_subscription_plans.findUnique({
    where: { plan_uuid: planUuid },
  });

  if (!plan) throw new Error("Subscription plan not found");

  const now = new Date();
  const durationDays = plan.duration_days || 30;
  const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const subscription_uuid = generateShortUUID();

  const subscription = await prisma.tbl_tenant_subscriptions.create({
    data: {
      subscription_uuid,
      tent_id: tenant.tent_id,
      plan_id: plan.plan_id,
      start_date: now,
      end_date: endDate,
      is_active: isTrial ? true : false,
      is_auto_renew: isAutoRenew,
      payment_status: paymentStatus,
    },
    include: {
      tbl_subscription_plans: true,
    },
  });

  return subscription;
}

// 🔹 Update payment status (post payment success)
export async function updateSubscriptionPaymentRepo(subscriptionUuid, status) {
  return prisma.tbl_tenant_subscriptions.update({
    where: { subscription_uuid: subscriptionUuid },
    data: {
      payment_status: status,
      is_active: status === "PAID",
      modified_on: new Date(),
    },
  });
}

// 🔹 Fetch current active subscription for a tenant
export async function getTenantActiveSubscriptionRepo(tentUuid) {
  return prisma.tbl_tenant_subscriptions.findFirst({
    where: {
      tbl_tent_master: { tent_uuid: tentUuid },
      is_active: true,
    },
    include: {
      tbl_subscription_plans: true,
    },
  });
}
