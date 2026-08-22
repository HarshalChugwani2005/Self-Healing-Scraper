// ============================================================================
// notifier.js — Downstream alert dispatcher (Discord & Slack Webhooks)
// ============================================================================
// Sends automated downstream notifications when:
//   1. Clean scrape completes with new job notifications
//   2. A break is detected and self-healing successfully fixes it
// ============================================================================

/**
 * Send a webhook payload to the configured WEBHOOK_URL.
 * Supports Discord, Slack, and generic JSON webhook receivers.
 *
 * @param {Object} payload - { title, description, color, fields }
 */
async function sendWebhookAlert({ title, description, color = 0x3dd68c, fields = [] }) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
        // No webhook configured — silent bypass
        return;
    }

    const platform = (process.env.WEBHOOK_PLATFORM || (webhookUrl.includes('slack.com') ? 'slack' : 'discord')).toLowerCase();

    try {
        let body;

        if (platform === 'slack') {
            // Slack Incoming Webhook Format
            const hexColor = '#' + color.toString(16).padStart(6, '0');
            const slackFields = fields.map(f => `*${f.name}*\n${f.value}`).join('\n\n');
            const formattedText = `*${title}*\n${description}${slackFields ? '\n\n' + slackFields : ''}`;

            body = {
                text: formattedText,
                attachments: [
                    {
                        color: hexColor,
                        title,
                        text: description,
                        fields: fields.map(f => ({
                            title: f.name,
                            value: f.value,
                            short: !!f.inline
                        })),
                        footer: 'FreeJobAlert Self-Healing Pipeline',
                        ts: Math.floor(Date.now() / 1000)
                    }
                ]
            };
        } else {
            // Discord Webhook Format
            body = {
                username: 'Self-Healing Scraper Bot',
                content: `📢 **${title}**\n${description}`,
                embeds: [
                    {
                        title,
                        description,
                        color,
                        fields: fields.map(f => ({ name: f.name, value: f.value, inline: !!f.inline })),
                        timestamp: new Date().toISOString(),
                        footer: { text: 'FreeJobAlert Self-Healing Pipeline' }
                    }
                ]
            };
        }

        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            console.log(`  🔔 Downstream ${platform} alert sent successfully`);
        } else {
            console.log(`  ⚠️ Webhook alert failed with status ${res.status}`);
        }
    } catch (err) {
        console.log(`  ⚠️ Could not send webhook alert: ${err.message}`);
    }
}

/**
 * Notify downstream consumers of a successful scrape run.
 */
async function notifyScrapeSuccess(rowCount, sampleRows = []) {
    if (!process.env.WEBHOOK_URL) return;

    const fields = sampleRows.slice(0, 3).map((r, i) => ({
        name: `📋 #${i + 1} ${r.post_name || 'Job Notification'}`,
        value: `🏢 **Board:** ${r.recruitment_board || '—'}\n📅 **Last Date:** ${r.last_date || '—'}\n🔗 [View Notice](${r.detail_url || '#'})`,
        inline: false
    }));

    await sendWebhookAlert({
        title: '✅ New Job Notifications Scraped',
        description: `Successfully extracted **${rowCount}** live job postings from FreeJobAlert.com.`,
        color: 0x3dd68c, // green
        fields
    });
}

/**
 * Notify downstream consumers of an AI self-healing event.
 */
async function notifyHealSuccess(healEventId, failureReason, verifiedRowCount) {
    if (!process.env.WEBHOOK_URL) return;

    await sendWebhookAlert({
        title: '🔧 Self-Healing Scraper Fixed Breakage',
        description: `Scraper broke and was **automatically healed** by Bright Data AI Agent.\n\n**Failure Detected:**\n> ${failureReason.substring(0, 180)}...`,
        color: 0xf5b041, // amber
        fields: [
            { name: 'Heal Event', value: `#${healEventId}`, inline: true },
            { name: 'Verified Rows', value: `${verifiedRowCount} rows`, inline: true },
            { name: 'Status', value: 'Verified Healthy ✅', inline: true }
        ]
    });
}

module.exports = {
    sendWebhookAlert,
    notifyScrapeSuccess,
    notifyHealSuccess
};
