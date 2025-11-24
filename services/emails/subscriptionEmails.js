// subscriptionEmails.js

import { loadTemplate, sendEmail } from "../../utils/resendEmail.js";

const clientUrl = process.env.CLIENT_URL;
const currentYear = new Date().getFullYear();

/**
 * Helper function to format date
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Helper function to calculate days remaining
 */
function getDaysRemaining(endDate) {
  const today = new Date();
  const end = new Date(endDate);
  const diffTime = end - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * 7 Days Before Expiry - First Reminder
 */
export async function sendExpiryReminderEmail(subscription) {
  let html = await loadTemplate("subscriptionReminder7Days.html");

  const daysRemaining = getDaysRemaining(subscription.end_date);
  const renewUrl = `${clientUrl}/subscription/renew`;

  html = html
    .replace(/{{tent_name}}/g, subscription.tent_name)
    .replace(/{{plan_name}}/g, subscription.plan_name)
    .replace(/{{end_date}}/g, formatDate(subscription.end_date))
    .replace(/{{days_remaining}}/g, daysRemaining)
    .replace(/{{renew_url}}/g, renewUrl)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear)
    .replace(/{{is_auto_renew}}/g, subscription.is_auto_renew);

  await sendEmail({
    to: subscription.tent_email,
    subject: "⏰ Your Quanta Subscription Expires in 7 Days",
    html,
  });
}

/**
 * 3 Days Before Expiry - Urgent Reminder
 */
export async function sendUrgentExpiryEmail(subscription) {
  let html = await loadTemplate("subscriptionReminder3Day.html");

  const daysRemaining = getDaysRemaining(subscription.end_date);
  const renewUrl = `${clientUrl}/subscription/renew`;

  html = html
    .replace(/{{tent_name}}/g, subscription.tent_name)
    .replace(/{{plan_name}}/g, subscription.plan_name)
    .replace(/{{end_date}}/g, formatDate(subscription.end_date))
    .replace(/{{days_remaining}}/g, daysRemaining)
    .replace(/{{renew_url}}/g, renewUrl)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear)
    .replace(/{{is_auto_renew}}/g, subscription.is_auto_renew);

  await sendEmail({
    to: subscription.tent_email,
    subject: "🚨 URGENT: Your Quanta Subscription Expires in 3 Days",
    html,
  });
}

/**
 * 1 Day Before Expiry - Final Reminder
 */
export async function sendFinalReminderEmail(subscription) {
  let html = await loadTemplate("subscriptionReminder1Day.html");

  const renewUrl = `${clientUrl}/subscription/renew`;

  html = html
    .replace(/{{tent_name}}/g, subscription.tent_name)
    .replace(/{{plan_name}}/g, subscription.plan_name)
    .replace(/{{end_date}}/g, formatDate(subscription.end_date))
    .replace(/{{renew_url}}/g, renewUrl)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear)
    .replace(/{{is_auto_renew}}/g, subscription.is_auto_renew);

  await sendEmail({
    to: subscription.tent_email,
    subject: "⚠️ FINAL NOTICE: Your Quanta Subscription Expires Tomorrow",
    html,
  });
}

/**
 * Subscription Expired - Immediate notification
 */
export async function sendExpiredNotificationEmail(subscription) {
  let html = await loadTemplate("subscriptionExpired.html");

  const renewUrl = `${clientUrl}/subscription/renew`;

  html = html
    .replace(/{{tent_name}}/g, subscription.tent_name)
    .replace(/{{plan_name}}/g, subscription.plan_name)
    .replace(/{{end_date}}/g, formatDate(subscription.end_date))
    .replace(/{{renew_url}}/g, renewUrl)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear);

  await sendEmail({
    to: subscription.tent_email,
    subject: "❌ Your Quanta Subscription Has Expired",
    html,
  });
}

/**
 * Day 3 After Expiration - First Follow-up
 */
export async function sendFollowUpDay3Email(subscription) {
  let html = await loadTemplate("subscriptionFollowUpDay3.html");

  const renewUrl = `${clientUrl}/subscription/renew`;
  const supportUrl = `${clientUrl}/contact`;

  html = html
    .replace(/{{tent_name}}/g, subscription.tent_name)
    .replace(/{{plan_name}}/g, subscription.plan_name)
    .replace(/{{renew_url}}/g, renewUrl)
    .replace(/{{support_url}}/g, supportUrl)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear);

  await sendEmail({
    to: subscription.tent_email,
    subject: "💡 We Miss You! Renew Your Quanta Subscription",
    html,
  });
}

/**
 * Day 7 After Expiration - Second Follow-up with special offer
 */
export async function sendFollowUpDay7Email(subscription) {
  let html = await loadTemplate("subscriptionFollowUpDay7.html");

  const renewUrl = `${clientUrl}/subscription/renew`;
  const supportUrl = `${clientUrl}/contact`;

  html = html
    .replace(/{{tent_name}}/g, subscription.tent_name)
    .replace(/{{plan_name}}/g, subscription.plan_name)
    .replace(/{{renew_url}}/g, renewUrl)
    .replace(/{{support_url}}/g, supportUrl)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear);

  await sendEmail({
    to: subscription.tent_email,
    subject: "🎁 Special Offer: Come Back to Quanta",
    html,
  });
}

/**
 * Day 14 After Expiration - Final Follow-up
 */
export async function sendFollowUpDay14Email(subscription) {
  let html = await loadTemplate("subscriptionFollowUpDay14.html");

  const renewUrl = `${clientUrl}/subscription/renew`;
  const supportUrl = `${clientUrl}/contact`;

  html = html
    .replace(/{{tent_name}}/g, subscription.tent_name)
    .replace(/{{plan_name}}/g, subscription.plan_name)
    .replace(/{{renew_url}}/g, renewUrl)
    .replace(/{{support_url}}/g, supportUrl)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear);

  await sendEmail({
    to: subscription.tent_email,
    subject: "👋 Last Chance to Rejoin Quanta",
    html,
  });
}
