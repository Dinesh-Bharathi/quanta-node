import prisma from "../../config/prismaClient.js";
import { Prisma } from "@prisma/client";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { sanitizeResponse } from "../../utils/sanitizeResponse.js";

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
  const plan = await prisma.tbl_subscription_plans.findUnique({
    where: { plan_uuid: planUuid },
    include: {
      tbl_plan_menus: {
        include: {
          tbl_menus: {
            include: { other_tbl_menus: true }, // fetch children
          },
        },
      },
    },
  });

  if (!plan) return null;

  // 🔹 Convert Prisma Decimal → Number
  const priceMonthly = plan.price_monthly ? Number(plan.price_monthly) : 0;
  const priceYearly = plan.price_yearly ? Number(plan.price_yearly) : 0;

  // 🔹 Convert Date → string
  const createdOn = plan.created_on ? plan.created_on.toISOString() : null;
  const modifiedOn = plan.modified_on ? plan.modified_on.toISOString() : null;

  // Extract all unique menus
  const menus = plan.tbl_plan_menus.map((pm) => pm.tbl_menus);

  // 🔹 Build menu hierarchy like your expected example
  const buildMenuTree = (menus) => {
    const map = {};
    const groups = {};

    menus.forEach((menu) => {
      map[menu.menu_id] = {
        title: menu.menu_name,
        url: menu.path,
        icon: menu.icon,
        subItems: [],
        is_main_menu: Boolean(menu.is_main_menu),
        is_footer_menu: Boolean(menu.is_footer_menu),
        menu_group: menu.menu_group,
      };
    });

    // Nest child menus under parents
    menus.forEach((menu) => {
      if (menu.parent_menu_id && map[menu.parent_menu_id]) {
        map[menu.parent_menu_id].subItems.push(map[menu.menu_id]);
      }
    });

    // Group top-level menus by menu_group
    menus.forEach((menu) => {
      if (!menu.parent_menu_id) {
        const group = menu.menu_group || "General";
        if (!groups[group]) groups[group] = [];
        groups[group].push(map[menu.menu_id]);
      }
    });

    return Object.entries(groups).map(([group, items]) => ({
      title: group,
      items,
    }));
  };

  const formattedMenus = buildMenuTree(menus);

  // 🔹 Return final cleaned structure
  return sanitizeResponse({
    plan_uuid: plan.plan_uuid,
    plan_name: plan.plan_name,
    plan_description: plan.plan_description,
    price_monthly: priceMonthly,
    price_yearly: priceYearly,
    duration_days: plan.duration_days,
    is_trial: plan.is_trial,
    is_active: plan.is_active,
    created_on: createdOn,
    modified_on: modifiedOn,
    menus: formattedMenus,
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
  const endDate = new Date(now.getTime() + durationDays * 86400000);

  const subscription_uuid = generateShortUUID();

  try {
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

    const formatted = {
      subscription_uuid: subscription.subscription_uuid,
      plan: {
        plan_uuid: subscription.tbl_subscription_plans.plan_uuid,
        plan_name: subscription.tbl_subscription_plans.plan_name,
        plan_description: subscription.tbl_subscription_plans.plan_description,
        price_monthly: Number(
          subscription.tbl_subscription_plans.price_monthly || 0
        ),
        price_yearly: Number(
          subscription.tbl_subscription_plans.price_yearly || 0
        ),
        duration_days: subscription.tbl_subscription_plans.duration_days,
        is_trial: subscription.tbl_subscription_plans.is_trial,
      },
      start_date: subscription.start_date?.toISOString() || null,
      end_date: subscription.end_date?.toISOString() || null,
      is_active: subscription.is_active,
      is_auto_renew: subscription.is_auto_renew,
      payment_status: subscription.payment_status,
    };

    return sanitizeResponse(formatted);
  } catch (error) {
    // 🔥 Prisma unique constraint error
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("An active subscription already exists for this tenant.");
    }

    // Re-throw other errors
    throw error;
  }
}

// 🔹 Update payment status (post payment success)
export async function updateSubscriptionPaymentRepo(subscriptionUuid, status) {
  const subscriptionStatus = await prisma.tbl_tenant_subscriptions.update({
    where: { subscription_uuid: subscriptionUuid },
    data: {
      payment_status: status,
      is_active: status === "SUCCESS",
      modified_on: new Date(),
      is_active: status === "SUCCESS",
    },
  });

  const respose = {
    ...subscriptionStatus,
    start_date: subscriptionStatus.start_date
      ? subscriptionStatus.start_date.toISOString()
      : null,
    end_date: subscriptionStatus.end_date
      ? subscriptionStatus.end_date.toISOString()
      : null,
    created_on: subscriptionStatus.created_on
      ? subscriptionStatus.created_on.toISOString()
      : null,
    modified_on: subscriptionStatus.modified_on
      ? subscriptionStatus.modified_on.toISOString()
      : null,
  };

  return sanitizeResponse(respose);
}

// 🔹 Fetch current active subscription for a tenant
export async function getTenantActiveSubscriptionRepo(tentUuid) {
  const currentPlan = await prisma.tbl_tenant_subscriptions.findFirst({
    where: {
      tbl_tent_master: { tent_uuid: tentUuid },
      // is_active: true,
    },
    include: {
      tbl_subscription_plans: true,
    },
  });

  if (!currentPlan) {
    return { success: false, message: "No active subscription found" };
  }

  // ✅ Sanitize & format the response
  const formatted = {
    subscription_uuid: currentPlan.subscription_uuid,
    is_active: currentPlan.is_active,
    is_auto_renew: currentPlan.is_auto_renew,
    payment_status: currentPlan.payment_status,
    start_date: currentPlan.start_date
      ? currentPlan.start_date.toISOString()
      : null,
    end_date: currentPlan.end_date ? currentPlan.end_date.toISOString() : null,
    created_on: currentPlan.created_on
      ? currentPlan.created_on.toISOString()
      : null,
    modified_on: currentPlan.modified_on
      ? currentPlan.modified_on.toISOString()
      : null,
    plan_uuid: currentPlan.tbl_subscription_plans.plan_uuid,
    plan_name: currentPlan.tbl_subscription_plans.plan_name,
    plan_description: currentPlan.tbl_subscription_plans.plan_description,
    price_monthly: currentPlan.tbl_subscription_plans.price_monthly
      ? Number(currentPlan.tbl_subscription_plans.price_monthly)
      : null,
    price_yearly: currentPlan.tbl_subscription_plans.price_yearly
      ? Number(currentPlan.tbl_subscription_plans.price_yearly)
      : null,
    duration_days: currentPlan.tbl_subscription_plans.duration_days,
    is_trial: currentPlan.tbl_subscription_plans.is_trial,
    is_active: currentPlan.tbl_subscription_plans.is_active,
    created_on: currentPlan.tbl_subscription_plans.created_on
      ? currentPlan.tbl_subscription_plans.created_on.toISOString()
      : null,
    modified_on: currentPlan.tbl_subscription_plans.modified_on
      ? currentPlan.tbl_subscription_plans.modified_on.toISOString()
      : null,
  };

  return formatted;
}
