// subscriptionScheduler.js
import cron from "node-cron";
import {
  checkExpiringSubscriptions,
  processExpiredSubscriptions,
  sendFollowUpEmails,
} from "../services/schedulers/subscriptionService.js";

/**
 * Initialize all subscription-related cron jobs
 */
export function initializeSubscriptionScheduler() {
  // Run daily at 9:00 AM - Check expiring subscriptions and send reminders
  cron.schedule("0 9 * * *", async () => {
    console.log("🕐 Running subscription expiry check...");
    try {
      await checkExpiringSubscriptions();
      console.log("✅ Subscription expiry check completed");
    } catch (error) {
      console.error("❌ Error in subscription expiry check:", error);
    }
  });

  // Run daily at 10:00 AM - Process expired subscriptions
  cron.schedule("0 10 * * *", async () => {
    console.log("🕐 Processing expired subscriptions...");
    try {
      await processExpiredSubscriptions();
      console.log("✅ Expired subscriptions processed");
    } catch (error) {
      console.error("❌ Error processing expired subscriptions:", error);
    }
  });

  // Run daily at 11:00 AM - Send follow-up emails to expired subscriptions
  cron.schedule("0 11 * * *", async () => {
    console.log("🕐 Sending follow-up emails...");
    try {
      await sendFollowUpEmails();
      console.log("✅ Follow-up emails sent");
    } catch (error) {
      console.error("❌ Error sending follow-up emails:", error);
    }
  });

  console.log("✅ Subscription scheduler initialized");
}

// For manual testing
export async function runManualCheck() {
  console.log("🔧 Running manual subscription check...");
  await checkExpiringSubscriptions();
  await processExpiredSubscriptions();
  await sendFollowUpEmails();
  console.log("✅ Manual check completed");
}
