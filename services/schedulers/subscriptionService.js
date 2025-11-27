// subscriptionService.js
import prisma from "../../config/prismaClient.js";
import {
  sendExpiryReminderEmail,
  sendUrgentExpiryEmail,
  sendFinalReminderEmail,
  sendExpiredNotificationEmail,
  sendFollowUpDay3Email,
  sendFollowUpDay7Email,
  sendFollowUpDay14Email,
} from "../emails/subscriptionEmails.js";

/**
 * Helper function to get date without time (for comparison)
 */
function getDateOnly(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Helper function to add days to current date
 */
function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Helper function to subtract days from current date
 */
function subtractDays(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Check for subscriptions expiring in 7, 3, and 1 days
 * Send appropriate reminder emails
 */
export async function checkExpiringSubscriptions() {
  try {
    const now = new Date();
    const sevenDaysFromNow = addDays(7);
    const threeDaysFromNow = addDays(3);
    const oneDayFromNow = addDays(1);

    const sevenDaysEnd = new Date(sevenDaysFromNow);
    sevenDaysEnd.setHours(23, 59, 59, 999);

    const threeDaysEnd = new Date(threeDaysFromNow);
    threeDaysEnd.setHours(23, 59, 59, 999);

    const oneDayEnd = new Date(oneDayFromNow);
    oneDayEnd.setHours(23, 59, 59, 999);

    // Get subscriptions expiring in 7 days
    const sevenDaysSubs = await prisma.tbl_tenant_subscriptions.findMany({
      where: {
        is_active: true,
        end_date: {
          gte: sevenDaysFromNow,
          lte: sevenDaysEnd,
        },
        tbl_tent_master: {
          tent_email: {
            not: null,
          },
        },
      },
      include: {
        tbl_tent_master: {
          select: {
            tent_name: true,
            tent_email: true,
          },
        },
        tbl_subscription_plans: {
          select: {
            plan_name: true,
            price_monthly: true,
            price_yearly: true,
            duration_days: true,
          },
        },
      },
    });

    for (const sub of sevenDaysSubs) {
      const emailData = {
        subscription_id: sub.subscription_id,
        subscription_uuid: sub.subscription_uuid,
        tent_id: sub.tent_id,
        end_date: sub.end_date,
        is_auto_renew: sub.is_auto_renew,
        tent_name: sub.tbl_tent_master.tent_name,
        tent_email: sub.tbl_tent_master.tent_email,
        plan_name: sub.tbl_subscription_plans.plan_name,
        price_monthly: sub.tbl_subscription_plans.price_monthly,
        price_yearly: sub.tbl_subscription_plans.price_yearly,
        duration_days: sub.tbl_subscription_plans.duration_days,
      };

      await sendExpiryReminderEmail(emailData);
      console.log(`📧 7-day reminder sent to: ${emailData.tent_email}`);

      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Get subscriptions expiring in 3 days
    const threeDaysSubs = await prisma.tbl_tenant_subscriptions.findMany({
      where: {
        is_active: true,
        end_date: {
          gte: threeDaysFromNow,
          lte: threeDaysEnd,
        },
        tbl_tent_master: {
          tent_email: {
            not: null,
          },
        },
      },
      include: {
        tbl_tent_master: {
          select: {
            tent_name: true,
            tent_email: true,
          },
        },
        tbl_subscription_plans: {
          select: {
            plan_name: true,
            price_monthly: true,
            price_yearly: true,
            duration_days: true,
          },
        },
      },
    });

    for (const sub of threeDaysSubs) {
      const emailData = {
        subscription_id: sub.subscription_id,
        subscription_uuid: sub.subscription_uuid,
        tent_id: sub.tent_id,
        end_date: sub.end_date,
        is_auto_renew: sub.is_auto_renew,
        tent_name: sub.tbl_tent_master.tent_name,
        tent_email: sub.tbl_tent_master.tent_email,
        plan_name: sub.tbl_subscription_plans.plan_name,
        price_monthly: sub.tbl_subscription_plans.price_monthly,
        price_yearly: sub.tbl_subscription_plans.price_yearly,
        duration_days: sub.tbl_subscription_plans.duration_days,
      };

      await sendUrgentExpiryEmail(emailData);
      console.log(`📧 3-day urgent reminder sent to: ${emailData.tent_email}`);

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Get subscriptions expiring in 1 day
    const oneDaysSubs = await prisma.tbl_tenant_subscriptions.findMany({
      where: {
        is_active: true,
        end_date: {
          gte: oneDayFromNow,
          lte: oneDayEnd,
        },
        tbl_tent_master: {
          tent_email: {
            not: null,
          },
        },
      },
      include: {
        tbl_tent_master: {
          select: {
            tent_name: true,
            tent_email: true,
          },
        },
        tbl_subscription_plans: {
          select: {
            plan_name: true,
            price_monthly: true,
            price_yearly: true,
            duration_days: true,
          },
        },
      },
    });

    for (const sub of oneDaysSubs) {
      const emailData = {
        subscription_id: sub.subscription_id,
        subscription_uuid: sub.subscription_uuid,
        tent_id: sub.tent_id,
        end_date: sub.end_date,
        is_auto_renew: sub.is_auto_renew,
        tent_name: sub.tbl_tent_master.tent_name,
        tent_email: sub.tbl_tent_master.tent_email,
        plan_name: sub.tbl_subscription_plans.plan_name,
        price_monthly: sub.tbl_subscription_plans.price_monthly,
        price_yearly: sub.tbl_subscription_plans.price_yearly,
        duration_days: sub.tbl_subscription_plans.duration_days,
      };

      await sendFinalReminderEmail(emailData);
      console.log(`📧 Final 1-day reminder sent to: ${emailData.tent_email}`);

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const totalEmails =
      sevenDaysSubs.length + threeDaysSubs.length + oneDaysSubs.length;
    console.log(`✅ Expiry reminders processed: ${totalEmails} emails sent`);
    console.log(`   - 7 days: ${sevenDaysSubs.length} emails`);
    console.log(`   - 3 days: ${threeDaysSubs.length} emails`);
    console.log(`   - 1 day: ${oneDaysSubs.length} emails`);
  } catch (error) {
    console.error("❌ Error checking expiring subscriptions:", error);
    throw error;
  }
}

/**
 * Process subscriptions that have expired today
 * Deactivate them and send notification
 */
export async function processExpiredSubscriptions() {
  try {
    const now = new Date();

    // Find subscriptions that expired (end_date is in the past and still active)
    const expiredSubs = await prisma.tbl_tenant_subscriptions.findMany({
      where: {
        is_active: true,
        end_date: {
          lt: now,
        },
        tbl_tent_master: {
          tent_email: {
            not: null,
          },
        },
      },
      include: {
        tbl_tent_master: {
          select: {
            tent_name: true,
            tent_email: true,
          },
        },
        tbl_subscription_plans: {
          select: {
            plan_name: true,
          },
        },
      },
    });

    for (const sub of expiredSubs) {
      // Deactivate subscription
      await prisma.tbl_tenant_subscriptions.update({
        where: {
          subscription_id: sub.subscription_id,
        },
        data: {
          is_active: false,
        },
      });

      const emailData = {
        subscription_id: sub.subscription_id,
        subscription_uuid: sub.subscription_uuid,
        tent_id: sub.tent_id,
        end_date: sub.end_date,
        is_auto_renew: sub.is_auto_renew,
        tent_name: sub.tbl_tent_master.tent_name,
        tent_email: sub.tbl_tent_master.tent_email,
        plan_name: sub.tbl_subscription_plans.plan_name,
      };

      // Send expiration notification
      await sendExpiredNotificationEmail(emailData);
      console.log(
        `📧 Expiration notification sent to: ${emailData.tent_email}`
      );

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`✅ ${expiredSubs.length} expired subscriptions processed`);
  } catch (error) {
    console.error("❌ Error processing expired subscriptions:", error);
    throw error;
  }
}

/**
 * Send follow-up emails to expired subscriptions
 * Day 3, Day 7, and Day 14 after expiration
 */
export async function sendFollowUpEmails() {
  try {
    const day3Date = subtractDays(3);
    const day7Date = subtractDays(7);
    const day14Date = subtractDays(14);

    const day3End = new Date(day3Date);
    day3End.setHours(23, 59, 59, 999);

    const day7End = new Date(day7Date);
    day7End.setHours(23, 59, 59, 999);

    const day14End = new Date(day14Date);
    day14End.setHours(23, 59, 59, 999);

    // Day 3 follow-up (3 days after expiration)
    const day3Subs = await prisma.tbl_tenant_subscriptions.findMany({
      where: {
        is_active: false,
        end_date: {
          gte: day3Date,
          lte: day3End,
        },
        tbl_tent_master: {
          tent_email: {
            not: null,
          },
        },
      },
      include: {
        tbl_tent_master: {
          select: {
            tent_name: true,
            tent_email: true,
          },
        },
        tbl_subscription_plans: {
          select: {
            plan_name: true,
            price_monthly: true,
            price_yearly: true,
          },
        },
      },
    });

    for (const sub of day3Subs) {
      const emailData = {
        subscription_id: sub.subscription_id,
        subscription_uuid: sub.subscription_uuid,
        tent_id: sub.tent_id,
        end_date: sub.end_date,
        tent_name: sub.tbl_tent_master.tent_name,
        tent_email: sub.tbl_tent_master.tent_email,
        plan_name: sub.tbl_subscription_plans.plan_name,
        price_monthly: sub.tbl_subscription_plans.price_monthly,
        price_yearly: sub.tbl_subscription_plans.price_yearly,
      };

      await sendFollowUpDay3Email(emailData);
      console.log(`📧 Day 3 follow-up sent to: ${emailData.tent_email}`);

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Day 7 follow-up (7 days after expiration)
    const day7Subs = await prisma.tbl_tenant_subscriptions.findMany({
      where: {
        is_active: false,
        end_date: {
          gte: day7Date,
          lte: day7End,
        },
        tbl_tent_master: {
          tent_email: {
            not: null,
          },
        },
      },
      include: {
        tbl_tent_master: {
          select: {
            tent_name: true,
            tent_email: true,
          },
        },
        tbl_subscription_plans: {
          select: {
            plan_name: true,
            price_monthly: true,
            price_yearly: true,
          },
        },
      },
    });

    for (const sub of day7Subs) {
      const emailData = {
        subscription_id: sub.subscription_id,
        subscription_uuid: sub.subscription_uuid,
        tent_id: sub.tent_id,
        end_date: sub.end_date,
        tent_name: sub.tbl_tent_master.tent_name,
        tent_email: sub.tbl_tent_master.tent_email,
        plan_name: sub.tbl_subscription_plans.plan_name,
        price_monthly: sub.tbl_subscription_plans.price_monthly,
        price_yearly: sub.tbl_subscription_plans.price_yearly,
      };

      await sendFollowUpDay7Email(emailData);
      console.log(`📧 Day 7 follow-up sent to: ${emailData.tent_email}`);

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Day 14 follow-up (14 days after expiration) - Final reminder
    const day14Subs = await prisma.tbl_tenant_subscriptions.findMany({
      where: {
        is_active: false,
        end_date: {
          gte: day14Date,
          lte: day14End,
        },
        tbl_tent_master: {
          tent_email: {
            not: null,
          },
        },
      },
      include: {
        tbl_tent_master: {
          select: {
            tent_name: true,
            tent_email: true,
          },
        },
        tbl_subscription_plans: {
          select: {
            plan_name: true,
            price_monthly: true,
            price_yearly: true,
          },
        },
      },
    });

    for (const sub of day14Subs) {
      const emailData = {
        subscription_id: sub.subscription_id,
        subscription_uuid: sub.subscription_uuid,
        tent_id: sub.tent_id,
        end_date: sub.end_date,
        tent_name: sub.tbl_tent_master.tent_name,
        tent_email: sub.tbl_tent_master.tent_email,
        plan_name: sub.tbl_subscription_plans.plan_name,
        price_monthly: sub.tbl_subscription_plans.price_monthly,
        price_yearly: sub.tbl_subscription_plans.price_yearly,
      };

      await sendFollowUpDay14Email(emailData);
      console.log(`📧 Day 14 final follow-up sent to: ${emailData.tent_email}`);

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const totalFollowUps = day3Subs.length + day7Subs.length + day14Subs.length;
    console.log(`✅ Follow-up emails sent: ${totalFollowUps} total`);
    console.log(`   - Day 3: ${day3Subs.length} emails`);
    console.log(`   - Day 7: ${day7Subs.length} emails`);
    console.log(`   - Day 14: ${day14Subs.length} emails`);
  } catch (error) {
    console.error("❌ Error sending follow-up emails:", error);
    throw error;
  }
}
