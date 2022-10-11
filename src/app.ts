import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import fetch from 'node-fetch';

/**
 * Function to receive webhook messages from Trengo and parse custom field values from the message body.
 * This is done to prefill some (or all) of the custom fields when ticket is created to Trengo, to reduce
 * the amount of manual input required.
 */

/**
 * The signing key from Trengo webhook creation. Should be used for checking
 * the signature of incoming messages. Not implemented.
 */
const TRENGO_SIGNING_SECRET = process.env.TRENGO_SIGNING_SECRET;
// Trengo API token. Needed when calling Trengo APIs and can be created from Trengo integrations.
const TRENGO_TOKEN = process.env.TRENGO_TOKEN;
// Id of the custom ticket field for links. Can be found from the URL when editing custom field.
const TRENGO_LINK_FIELD_ID = process.env.TRENGO_LINK_FIELD_ID;

const log = new Logger();

/**
 * Parse different custom fields from the message. Currently only
 * matches URLs, but this could be expanded to different fields.
 */
function parseCustomTicketFields(message: string): string | undefined {
    // Match URLs from the message.
    const expression = /^(https:|http:|www\.)\S*/gi;
    const regex = new RegExp(expression);
    const urls = message.match(regex);

    if (urls?.length) {
        // Returns only one URL, but could loop through all found etc.
        return JSON.stringify({
            // Link.
            custom_field_id: TRENGO_LINK_FIELD_ID,
            value: urls[0],
        });
    }
}

/**
 * Send the found custom field values to Trengo https://developers.trengo.com/reference/custom-data
 * Probably needs to be sent one at a time.
 */
async function sendToTrengo(message: string, ticketId: number): Promise<void> {
    const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${TRENGO_TOKEN}`,
        'Content-Type': 'application/json',
    };

    try {
        await fetch(`https://app.trengo.com/api/v2/tickets/${ticketId}/custom_fields`, {
            headers,
            method: 'post',
            body: message,
        });
    } catch (error: unknown) {
        log.error('Error when sending to Trengo', JSON.stringify(error));
    }
}

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    let response: APIGatewayProxyResult;

    /** Some form of authentication would be needed here with TRENGO_SIGNING_SECRET. */
    try {
        // Trengo sends the body as URL parameters.
        const body = JSON.parse('{"' + event.body?.replace(/&/g, '","').replace(/=/g, '":"') + '"}', (key, value) =>
            key === '' ? value : decodeURIComponent(value),
        );
        const message = body.message;
        const ticketId = body.ticket_id;

        const customTicketFields = parseCustomTicketFields(message);

        if (customTicketFields) {
            // Could loop through all the different fields here.
            await sendToTrengo(customTicketFields, ticketId);
        }

        response = {
            statusCode: 201,
            body: JSON.stringify({
                message: `Ticket's ${ticketId} custom fields set`,
            }),
        };
    } catch (err: unknown) {
        log.error('Error', JSON.stringify(err));
        response = {
            statusCode: 500,
            body: JSON.stringify({
                message: err instanceof Error ? err.message : 'some error happened',
            }),
        };
    }

    return response;
};
