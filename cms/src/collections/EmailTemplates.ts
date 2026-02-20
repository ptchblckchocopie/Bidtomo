import type { CollectionConfig } from 'payload/types';

export const EmailTemplates: CollectionConfig = {
  slug: 'email-templates',
  admin: {
    useAsTitle: 'name',
    group: 'Settings',
    defaultColumns: ['name', 'type', 'subject', 'active', 'updatedAt'],
  },
  access: {
    read: () => true,
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'Internal name for this template',
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Bid Won - Buyer', value: 'bid_won_buyer' },
        { label: 'Bid Won - Seller', value: 'bid_won_seller' },
        { label: 'Auction Restarted', value: 'auction_restarted' },
        { label: 'Second Bidder Offer', value: 'second_bidder_offer' },
        { label: 'Void Request Created', value: 'void_request_created' },
        { label: 'Void Request Approved', value: 'void_request_approved' },
        { label: 'Void Request Rejected', value: 'void_request_rejected' },
        { label: 'New Bid Placed', value: 'new_bid_placed' },
        { label: 'Outbid Notification', value: 'outbid_notification' },
      ],
      admin: {
        description: 'Type of email template',
      },
    },
    {
      name: 'subject',
      type: 'text',
      required: true,
      admin: {
        description: 'Email subject line. Use {{variables}} for dynamic content.',
      },
    },
    {
      name: 'htmlContent',
      type: 'code',
      required: true,
      admin: {
        language: 'html',
        description: `
HTML email content. Available variables:
- {{buyerName}}, {{buyerEmail}} - Buyer information
- {{sellerName}}, {{sellerEmail}} - Seller information
- {{productTitle}}, {{productId}} - Product details
- {{bidAmount}}, {{currencySymbol}} - Bid/price information
- {{auctionEndDate}} - Auction end date
- {{reason}} - Void request reason
- {{platformName}} - Platform name (Veent Marketplace)
- {{platformUrl}} - Platform URL
        `,
      },
    },
    {
      name: 'textContent',
      type: 'textarea',
      admin: {
        description: 'Plain text version of the email (fallback)',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Enable/disable this template',
      },
    },
    {
      name: 'variablesHelp',
      type: 'ui',
      admin: {
        components: {
          Field: () => null,
        },
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data }) => {
        // Ensure only one active template per type
        return data;
      },
    ],
  },
};

// Default templates that will be seeded
export const defaultEmailTemplates = [
  {
    name: 'Bid Won - Buyer Notification',
    type: 'bid_won_buyer',
    subject: 'Congratulations! You won the bid for "{{productTitle}}"',
    active: true,
    htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .highlight { background: #fef3c7; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .btn { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Congratulations!</h1>
    </div>
    <div class="content">
      <p>Hi {{buyerName}},</p>
      <p>Great news! Your bid has been accepted for <strong>{{productTitle}}</strong>.</p>

      <div class="highlight">
        <p><strong>Winning Bid:</strong> {{currencySymbol}}{{bidAmount}}</p>
        <p><strong>Seller:</strong> {{sellerName}}</p>
      </div>

      <p>The seller has been notified and will reach out to you shortly to discuss the next steps for completing this transaction.</p>

      <p>You can view the conversation in your inbox:</p>
      <a href="{{platformUrl}}/inbox?product={{productId}}" class="btn">Go to Inbox</a>

      <p style="margin-top: 20px;">Thank you for using {{platformName}}!</p>
    </div>
    <div class="footer">
      <p>This is an automated message from {{platformName}}.</p>
    </div>
  </div>
</body>
</html>
    `,
    textContent: `
Congratulations {{buyerName}}!

Your bid has been accepted for "{{productTitle}}".

Winning Bid: {{currencySymbol}}{{bidAmount}}
Seller: {{sellerName}}

The seller has been notified and will reach out to you shortly to discuss the next steps.

View the conversation: {{platformUrl}}/inbox?product={{productId}}

Thank you for using {{platformName}}!
    `,
  },
  {
    name: 'Bid Won - Seller Notification',
    type: 'bid_won_seller',
    subject: 'Your item "{{productTitle}}" has been sold!',
    active: true,
    htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .highlight { background: #dcfce7; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .btn { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Item Sold!</h1>
    </div>
    <div class="content">
      <p>Hi {{sellerName}},</p>
      <p>Great news! Your item <strong>{{productTitle}}</strong> has been sold.</p>

      <div class="highlight">
        <p><strong>Winning Bid:</strong> {{currencySymbol}}{{bidAmount}}</p>
        <p><strong>Buyer:</strong> {{buyerName}} ({{buyerEmail}})</p>
      </div>

      <p>A conversation has been automatically created with the buyer. Please reach out to them to arrange payment and delivery.</p>

      <a href="{{platformUrl}}/inbox?product={{productId}}" class="btn">Contact Buyer</a>

      <p style="margin-top: 20px;">Thank you for selling on {{platformName}}!</p>
    </div>
    <div class="footer">
      <p>This is an automated message from {{platformName}}.</p>
    </div>
  </div>
</body>
</html>
    `,
    textContent: `
Congratulations {{sellerName}}!

Your item "{{productTitle}}" has been sold.

Winning Bid: {{currencySymbol}}{{bidAmount}}
Buyer: {{buyerName}} ({{buyerEmail}})

A conversation has been automatically created with the buyer. Please reach out to them to arrange payment and delivery.

Contact Buyer: {{platformUrl}}/inbox?product={{productId}}

Thank you for selling on {{platformName}}!
    `,
  },
  {
    name: 'Auction Restarted Notification',
    type: 'auction_restarted',
    subject: 'Bidding has reopened for "{{productTitle}}"!',
    active: true,
    htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .highlight { background: #dbeafe; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Auction Reopened!</h1>
    </div>
    <div class="content">
      <p>Hi {{buyerName}},</p>
      <p>Good news! Bidding has been reopened for <strong>{{productTitle}}</strong>.</p>

      <div class="highlight">
        <p>The previous transaction was voided, and you now have another chance to place your bid!</p>
        <p><strong>New auction ends:</strong> {{auctionEndDate}}</p>
      </div>

      <p>Don't miss out on this opportunity!</p>

      <a href="{{platformUrl}}/products/{{productId}}" class="btn">Place Your Bid</a>

      <p style="margin-top: 20px;">Good luck!</p>
    </div>
    <div class="footer">
      <p>This is an automated message from {{platformName}}.</p>
    </div>
  </div>
</body>
</html>
    `,
    textContent: `
Hi {{buyerName}},

Good news! Bidding has been reopened for "{{productTitle}}".

The previous transaction was voided, and you now have another chance to place your bid!

New auction ends: {{auctionEndDate}}

Place your bid: {{platformUrl}}/products/{{productId}}

Good luck!
    `,
  },
  {
    name: 'Second Bidder Offer',
    type: 'second_bidder_offer',
    subject: 'You have an offer to purchase "{{productTitle}}"!',
    active: true,
    htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #7c3aed; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .highlight { background: #ede9fe; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .btn { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Special Offer!</h1>
    </div>
    <div class="content">
      <p>Hi {{buyerName}},</p>
      <p>The original transaction for <strong>{{productTitle}}</strong> was voided, and the seller has offered the item to you!</p>

      <div class="highlight">
        <p><strong>Your bid amount:</strong> {{currencySymbol}}{{bidAmount}}</p>
        <p><strong>Seller:</strong> {{sellerName}}</p>
      </div>

      <p>This is a limited-time offer. Please respond in your inbox to accept or decline.</p>

      <a href="{{platformUrl}}/inbox?product={{productId}}" class="btn">View Offer</a>

      <p style="margin-top: 20px;">Don't miss this opportunity!</p>
    </div>
    <div class="footer">
      <p>This is an automated message from {{platformName}}.</p>
    </div>
  </div>
</body>
</html>
    `,
    textContent: `
Hi {{buyerName}},

The original transaction for "{{productTitle}}" was voided, and the seller has offered the item to you!

Your bid amount: {{currencySymbol}}{{bidAmount}}
Seller: {{sellerName}}

This is a limited-time offer. Please respond in your inbox to accept or decline.

View Offer: {{platformUrl}}/inbox?product={{productId}}

Don't miss this opportunity!
    `,
  },
  {
    name: 'Void Request Created',
    type: 'void_request_created',
    subject: 'Void request received for "{{productTitle}}"',
    active: true,
    htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .highlight { background: #fef3c7; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .btn { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Void Request</h1>
    </div>
    <div class="content">
      <p>Hi {{buyerName}},</p>
      <p>A void request has been submitted for the transaction of <strong>{{productTitle}}</strong>.</p>

      <div class="highlight">
        <p><strong>Reason:</strong> {{reason}}</p>
      </div>

      <p>Please review this request and respond in your inbox.</p>

      <a href="{{platformUrl}}/inbox?product={{productId}}" class="btn">Review Request</a>
    </div>
    <div class="footer">
      <p>This is an automated message from {{platformName}}.</p>
    </div>
  </div>
</body>
</html>
    `,
    textContent: `
Hi {{buyerName}},

A void request has been submitted for the transaction of "{{productTitle}}".

Reason: {{reason}}

Please review this request and respond in your inbox.

Review Request: {{platformUrl}}/inbox?product={{productId}}
    `,
  },
];
