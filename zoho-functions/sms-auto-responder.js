/**
 * SMS Auto-Responder - Zoho Function
 * 
 * Automatically responds to inbound SMS based on keyword detection.
 * Handles STOP, INFO, HELP, and custom keywords.
 * 
 * Setup:
 * 1. Create this as a Zoho Function (Serverless)
 * 2. Configure webhook URL in Aircall/Kixie to point to this function
 * 3. Set up the auto-response templates below
 * 
 * @version 1.0.0
 * @author Sutton Funding
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
      // Aircall API credentials
      aircall: {
                apiId: 'dbfacc4059500e3d8cb8c28f949e4c98',
                apiToken: 'cead787941b243664e62a37eb3b55300',
                baseUrl: 'https://api.aircall.io/v1'
      },

      // Default sender number (Main Company Line)
      defaultNumberId: '1050811',

      // Zoho CRM module for logging
      loggingModule: 'Agent_SMS_Commands',

      // Rate limiting (messages per minute)
      rateLimit: 60
};

// ============================================
// AUTO-RESPONSE TEMPLATES
// ============================================

const RESPONSES = {
      // TCPA Compliance - Opt-out handling
      STOP: {
                keywords: ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'],
                response: 'You have been unsubscribed from Sutton Funding SMS messages. You will no longer receive texts from us. Reply START to opt back in.',
                action: 'OPT_OUT',
                logAs: 'Opt-Out Request'
      },

      // Opt back in
      START: {
                keywords: ['START', 'YES', 'UNSTOP', 'SUBSCRIBE'],
                response: 'Welcome back! You are now subscribed to receive SMS updates from Sutton Funding. Reply STOP at any time to unsubscribe.',
                action: 'OPT_IN',
                logAs: 'Opt-In Request'
      },

      // Help/Support
      HELP: {
                keywords: ['HELP', 'SUPPORT', '?', 'ASSIST'],
                response: 'Sutton Funding Support: Call us at (800) 555-1234 or visit suttonfunding.com. Reply STOP to unsubscribe, INFO for business hours.',
                action: 'INFO',
                logAs: 'Help Request'
      },

      // Business Information
      INFO: {
                keywords: ['INFO', 'HOURS', 'INFORMATION', 'DETAILS'],
                response: 'Sutton Funding: Mon-Fri 9AM-6PM EST. We offer business funding from $10K-$500K. Call (800) 555-1234 or reply with your question.',
                action: 'INFO',
                logAs: 'Info Request'
      },

      // Application Status
      STATUS: {
                keywords: ['STATUS', 'UPDATE', 'APPLICATION', 'WHERE'],
                response: 'To check your application status, please call us at (800) 555-1234 or reply with your business name. An agent will follow up shortly.',
                action: 'STATUS_REQUEST',
                logAs: 'Status Inquiry'
      },

      // Callback Request
      CALLBACK: {
                keywords: ['CALL', 'CALLBACK', 'CALL ME', 'PHONE'],
                response: 'We\'ll call you back within 15 minutes during business hours (Mon-Fri 9AM-6PM EST). If urgent, call us directly at (800) 555-1234.',
                action: 'CALLBACK_REQUEST',
                logAs: 'Callback Request'
      }
};

// ============================================
// MAIN WEBHOOK HANDLER
// ============================================

/**
 * Main entry point - handles incoming webhook from Aircall/Kixie
 * @param {Object} request - The webhook request object
 * @returns {Object} Response object
 */
async function handleWebhook(request) {
      try {
                // Parse the incoming webhook payload
          const payload = parseWebhookPayload(request);

          if (!payload || !payload.message || !payload.from) {
                        return { status: 'error', message: 'Invalid payload' };
          }

          console.log(`Received SMS from ${payload.from}: ${payload.message}`);

          // Detect keyword and get appropriate response
          const matchedResponse = detectKeyword(payload.message);

          if (matchedResponse) {
                        // Send auto-response
                    await sendSMS(payload.from, matchedResponse.response, payload.numberId);

                    // Log to Zoho CRM
                    await logToZoho(payload, matchedResponse);

                    // Handle special actions (opt-out, callback, etc.)
                    await handleSpecialActions(payload, matchedResponse);

                    return {
                                      status: 'success',
                                      keyword: matchedResponse.logAs,
                                      responseSent: true
                    };
          }

          // No keyword matched - log for manual follow-up
          await logToZoho(payload, {
                        action: 'MANUAL_REVIEW',
                        logAs: 'Unmatched - Needs Review'
          });

          return {
                        status: 'success',
                        keyword: 'none',
                        responseSent: false,
                        note: 'No keyword matched, logged for review'
          };

      } catch (error) {
                console.error('Error processing webhook:', error);
                return { status: 'error', message: error.message };
      }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse webhook payload from different providers
 */
function parseWebhookPayload(request) {
      const body = typeof request.body === 'string' 
        ? JSON.parse(request.body) 
                : request.body;

    // Aircall format
    if (body.event === 'message.created' || body.data?.direction === 'inbound') {
              return {
                            from: body.data?.from || body.from,
                            to: body.data?.to || body.to,
                            message: body.data?.content || body.content || body.data?.body,
                            numberId: body.data?.number_id || body.number_id,
                            timestamp: body.timestamp || new Date().toISOString(),
                            platform: 'Aircall',
                            rawPayload: body
              };
    }

    // Kixie format
    if (body.type === 'sms' || body.sms_body) {
              return {
                            from: body.from_number || body.caller_number,
                            to: body.to_number || body.destination_number,
                            message: body.sms_body || body.message,
                            numberId: body.line_id,
                            timestamp: body.created_at || new Date().toISOString(),
                            platform: 'Kixie',
                            rawPayload: body
              };
    }

    // Generic format
    return {
              from: body.from || body.sender,
              to: body.to || body.recipient,
              message: body.message || body.text || body.body,
              numberId: body.number_id || CONFIG.defaultNumberId,
              timestamp: body.timestamp || new Date().toISOString(),
              platform: 'Unknown',
              rawPayload: body
    };
}

/**
 * Detect keyword in message and return matching response config
 */
function detectKeyword(message) {
      const normalizedMessage = message.toUpperCase().trim();

    for (const [key, config] of Object.entries(RESPONSES)) {
              for (const keyword of config.keywords) {
                            // Check if message starts with keyword or is exactly the keyword
                  if (normalizedMessage === keyword || 
                                      normalizedMessage.startsWith(keyword + ' ') ||
                                      normalizedMessage.startsWith(keyword + '.') ||
                                      normalizedMessage.startsWith(keyword + '!')) {
                                    return config;
                  }
              }
    }

    return null;
}

/**
 * Send SMS via Aircall API
 */
async function sendSMS(to, message, numberId) {
      const numberIdToUse = numberId || CONFIG.defaultNumberId;

    const response = await fetch(
              `${CONFIG.aircall.baseUrl}/numbers/${numberIdToUse}/messages/native/send`,
      {
                    method: 'POST',
                    headers: {
                                      'Authorization': 'Basic ' + btoa(`${CONFIG.aircall.apiId}:${CONFIG.aircall.apiToken}`),
                                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                                      to: to,
                                      body: message
                    })
      }
          );

    if (!response.ok) {
              const errorData = await response.text();
              throw new Error(`SMS send failed: ${response.status} - ${errorData}`);
    }

    return await response.json();
}

/**
 * Log SMS interaction to Zoho CRM
 */
async function logToZoho(payload, responseConfig) {
      const record = {
                Name: `Auto-Response: ${responseConfig.logAs}`,
                Recipient_Phone: payload.from,
                Message_Body: payload.message,
                SMS_Platform: payload.platform,
                Direction: 'Inbound',
                Delivery_Status: 'Received',
                Auto_Response_Type: responseConfig.action || 'NONE',
                Sent_By: 'Auto-Responder',
                Created_Time: payload.timestamp
      };

    // Find related contact/lead/deal by phone number
    const relatedRecord = await findRelatedRecord(payload.from);
      if (relatedRecord) {
                record[relatedRecord.module] = relatedRecord.id;
      }

    try {
              await ZOHO.CRM.API.insertRecord({
                            Entity: CONFIG.loggingModule,
                            APIData: record
              });
              console.log('Logged to Zoho CRM:', record.Name);
    } catch (error) {
              console.error('Failed to log to Zoho:', error);
    }
}

/**
 * Find related record in Zoho CRM by phone number
 */
async function findRelatedRecord(phoneNumber) {
      // Normalize phone number
    const normalized = phoneNumber.replace(/\D/g, '');
      const searchPatterns = [
                normalized,
                normalized.slice(-10), // Last 10 digits
                '+1' + normalized.slice(-10)
            ];

    // Search in Deals first, then Contacts, then Leads
    const modules = ['Deals', 'Contacts', 'Leads'];

    for (const module of modules) {
              try {
                            for (const pattern of searchPatterns) {
                                              const response = await ZOHO.CRM.API.searchRecords({
                                                                    Entity: module,
                                                                    Type: 'phone',
                                                                    Query: pattern
                                              });

                                if (response.data && response.data.length > 0) {
                                                      return {
                                                                                module: module.slice(0, -1), // Remove 's' for field name
                                                                                id: response.data[0].id,
                                                                                name: response.data[0].Full_Name || response.data[0].Deal_Name
                                                      };
                                }
                            }
              } catch (error) {
                            // Continue to next module
              }
    }

    return null;
}

/**
 * Handle special actions based on response type
 */
async function handleSpecialActions(payload, responseConfig) {
      switch (responseConfig.action) {
        case 'OPT_OUT':
                      await updateOptOutStatus(payload.from, true);
                      break;

        case 'OPT_IN':
                      await updateOptOutStatus(payload.from, false);
                      break;

        case 'CALLBACK_REQUEST':
                      await createCallbackTask(payload);
                      break;

        case 'STATUS_REQUEST':
                      await notifyAgentForFollowUp(payload);
                      break;
      }
}

/**
 * Update opt-out status in Zoho CRM
 */
async function updateOptOutStatus(phoneNumber, optedOut) {
      const relatedRecord = await findRelatedRecord(phoneNumber);

    if (relatedRecord) {
              try {
                            await ZOHO.CRM.API.updateRecord({
                                              Entity: relatedRecord.module + 's',
                                              RecordID: relatedRecord.id,
                                              APIData: {
                                                                    SMS_Opt_Out: optedOut,
                                                                    SMS_Opt_Out_Date: optedOut ? new Date().toISOString() : null
                                              }
                            });
                            console.log(`Updated opt-out status for ${phoneNumber}: ${optedOut}`);
              } catch (error) {
                            console.error('Failed to update opt-out status:', error);
              }
    }
}

/**
 * Create a callback task for the sales team
 */
async function createCallbackTask(payload) {
      const relatedRecord = await findRelatedRecord(payload.from);

    const task = {
              Subject: `Callback Request from ${payload.from}`,
              Status: 'Not Started',
              Priority: 'High',
              Due_Date: new Date().toISOString().split('T')[0],
              Description: `Customer requested callback via SMS.\n\nOriginal message: ${payload.message}\n\nPhone: ${payload.from}`
    };

    if (relatedRecord) {
              task.What_Id = relatedRecord.id;
              task.$se_module = relatedRecord.module + 's';
    }

    try {
              await ZOHO.CRM.API.insertRecord({
                            Entity: 'Tasks',
                            APIData: task
              });
              console.log('Created callback task');
    } catch (error) {
              console.error('Failed to create callback task:', error);
    }
}

/**
 * Notify agent for follow-up (via Zoho notification or email)
 */
async function notifyAgentForFollowUp(payload) {
      const relatedRecord = await findRelatedRecord(payload.from);

    // If we found a related record, notify its owner
    if (relatedRecord) {
              try {
                            // Get record owner
                  const recordData = await ZOHO.CRM.API.getRecord({
                                    Entity: relatedRecord.module + 's',
                                    RecordID: relatedRecord.id
                  });

                  const ownerId = recordData.data[0]?.Owner?.id;

                  if (ownerId) {
                                    // Create a notification/task for the owner
                                await ZOHO.CRM.API.insertRecord({
                                                      Entity: 'Tasks',
                                                      APIData: {
                                                                                Subject: `Status Inquiry from ${payload.from}`,
                                                                                Status: 'Not Started',
                                                                                Priority: 'Normal',
                                                                                Owner: { id: ownerId },
                                                                                Due_Date: new Date().toISOString().split('T')[0],
                                                                                Description: `Customer inquired about their application status.\n\nMessage: ${payload.message}\n\nPhone: ${payload.from}`,
                                                                                What_Id: relatedRecord.id,
                                                                                $se_module: relatedRecord.module + 's'
                                                      }
                                });
                  }
              } catch (error) {
                            console.error('Failed to notify agent:', error);
              }
    }
}

// ============================================
// EXPORT FOR ZOHO FUNCTION
// ============================================

// For Zoho Function deployment
module.exports = {
      handleWebhook,
      detectKeyword,
      sendSMS,
      RESPONSES,
      CONFIG
};
